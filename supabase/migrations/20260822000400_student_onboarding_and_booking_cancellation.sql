-- Teacher-managed student onboarding and transactional booking cancellation.
-- Development project first. No production assumptions or legacy fallback.

begin;

create or replace function public.invite_student(
  p_email text,
  p_full_name text,
  p_nickname text default null,
  p_timezone text default 'Asia/Taipei',
  p_token_ttl_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_student public.students;
  v_claim_code text;
  v_expires_at timestamptz;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if v_email is null
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'valid email required' using errcode = '22023';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'full name required' using errcode = '22023';
  end if;
  if nullif(btrim(p_timezone), '') is null then
    raise exception 'timezone required' using errcode = '22023';
  end if;
  if p_token_ttl_hours is null or p_token_ttl_hours < 1 or p_token_ttl_hours > 168 then
    raise exception 'claim token lifetime must be between 1 and 168 hours' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where lower(email) = v_email
  for update;

  if found then
    if v_student.auth_user_id is not null then
      raise exception 'student email is already linked' using errcode = '23505';
    end if;
    if v_student.status = 'inactive' then
      raise exception 'inactive student cannot be invited' using errcode = '22023';
    end if;

    update public.students
    set full_name = btrim(p_full_name),
        nickname = nullif(btrim(p_nickname), ''),
        timezone = btrim(p_timezone),
        updated_at = now()
    where id = v_student.id
    returning * into v_student;
  else
    insert into public.students (email, full_name, nickname, timezone)
    values (
      v_email,
      btrim(p_full_name),
      nullif(btrim(p_nickname), ''),
      btrim(p_timezone)
    )
    returning * into v_student;
  end if;

  -- A reissue makes every previous unconsumed code unusable immediately.
  delete from public.student_claim_tokens
  where student_id = v_student.id and consumed_at is null;

  v_claim_code := encode(extensions.gen_random_bytes(16), 'hex');
  v_expires_at := now() + make_interval(hours => p_token_ttl_hours);

  insert into public.student_claim_tokens (
    student_id, token_hash, expires_at, created_by
  ) values (
    v_student.id,
    extensions.digest(convert_to(v_claim_code, 'UTF8'), 'sha256'),
    v_expires_at,
    auth.uid()
  );

  perform private.write_audit(
    'student_invited', 'student', v_student.id, v_student.id,
    null,
    jsonb_build_object(
      'email', v_student.email,
      'full_name', v_student.full_name,
      'claim_expires_at', v_expires_at
    ),
    null
  );

  return jsonb_build_object(
    'student', to_jsonb(v_student),
    'claim_code', v_claim_code,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.reissue_student_claim_code(
  p_student_id uuid,
  p_token_ttl_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;
  if v_student.auth_user_id is not null then
    raise exception 'student profile is already linked' using errcode = '23505';
  end if;

  return public.invite_student(
    v_student.email,
    v_student.full_name,
    v_student.nickname,
    v_student.timezone,
    p_token_ttl_hours
  );
end;
$$;

create or replace function private.enforce_booking_request_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available integer;
  v_pending integer;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  -- Preserve RPC idempotency: retries reach ON CONFLICT instead of failing here.
  if exists (
    select 1 from public.booking_requests
    where idempotency_key = new.idempotency_key
  ) then
    return new;
  end if;

  select count(*) into v_available
  from public.lesson_credits
  where student_id = new.student_id and status = 'available';

  select count(*) into v_pending
  from public.booking_requests
  where student_id = new.student_id and status = 'pending';

  if v_available <= v_pending then
    raise exception 'no uncommitted lesson credit available' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_requests_capacity_guard on public.booking_requests;
create trigger booking_requests_capacity_guard
before insert on public.booking_requests
for each row execute function private.enforce_booking_request_capacity();

revoke all on function private.enforce_booking_request_capacity()
  from public, anon, authenticated;

create or replace function public.cancel_own_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := private.current_student_id();
  v_before public.bookings;
  v_booking public.bookings;
  v_credit public.lesson_credits;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), '生徒によるキャンセル');
begin
  if v_student_id is null then
    raise exception 'student profile not linked' using errcode = '42501';
  end if;

  select * into v_before
  from public.bookings
  where id = p_booking_id and student_id = v_student_id
  for update;

  if not found then
    raise exception 'booking not found for student' using errcode = 'P0002';
  end if;
  if v_before.status = 'cancelled' then
    return v_before;
  end if;
  if v_before.status <> 'reserved' then
    raise exception 'only reserved bookings can be cancelled' using errcode = '22023';
  end if;
  if v_before.starts_at <= now() + interval '12 hours' then
    raise exception 'booking cancellation deadline has passed' using errcode = '22023';
  end if;

  select * into v_credit
  from public.lesson_credits
  where id = v_before.lesson_credit_id
  for update;
  if not found or v_credit.status <> 'reserved' or v_credit.booking_id <> v_before.id then
    raise exception 'reserved credit does not match booking' using errcode = '23514';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancellation_reason = v_reason
  where id = v_before.id and status = 'reserved'
  returning * into v_booking;
  if not found then
    raise exception 'booking was concurrently processed' using errcode = '40001';
  end if;

  update public.lesson_credits
  set status = 'available', booking_id = null, reserved_at = null
  where id = v_credit.id and status = 'reserved' and booking_id = v_before.id;
  if not found then
    raise exception 'credit was concurrently processed' using errcode = '40001';
  end if;

  update public.booking_candidates
  set status = 'cancelled'
  where id = v_before.candidate_id and status = 'selected';

  update public.booking_requests
  set status = 'cancelled', approved_candidate_id = null
  where id = v_before.request_id and status = 'approved';
  if not found then
    raise exception 'approved request does not match booking' using errcode = '23514';
  end if;

  perform private.write_audit(
    'booking_cancelled_by_student', 'booking', v_booking.id, v_booking.student_id,
    to_jsonb(v_before), to_jsonb(v_booking), v_reason
  );
  return v_booking;
end;
$$;

create or replace function public.cancel_booking_as_teacher(
  p_booking_id uuid,
  p_reason text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.bookings;
  v_booking public.bookings;
  v_credit public.lesson_credits;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'cancellation reason required' using errcode = '22023';
  end if;

  select * into v_before
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'cancelled' then
    return v_before;
  end if;
  if v_before.status <> 'reserved' then
    raise exception 'only reserved bookings can be cancelled' using errcode = '22023';
  end if;

  select * into v_credit
  from public.lesson_credits
  where id = v_before.lesson_credit_id
  for update;
  if not found or v_credit.status <> 'reserved' or v_credit.booking_id <> v_before.id then
    raise exception 'reserved credit does not match booking' using errcode = '23514';
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancellation_reason = btrim(p_reason)
  where id = v_before.id and status = 'reserved'
  returning * into v_booking;
  if not found then
    raise exception 'booking was concurrently processed' using errcode = '40001';
  end if;

  update public.lesson_credits
  set status = 'available', booking_id = null, reserved_at = null
  where id = v_credit.id and status = 'reserved' and booking_id = v_before.id;
  if not found then
    raise exception 'credit was concurrently processed' using errcode = '40001';
  end if;

  update public.booking_candidates
  set status = 'cancelled'
  where id = v_before.candidate_id and status = 'selected';

  update public.booking_requests
  set status = 'cancelled', approved_candidate_id = null
  where id = v_before.request_id and status = 'approved';
  if not found then
    raise exception 'approved request does not match booking' using errcode = '23514';
  end if;

  perform private.write_audit(
    'booking_cancelled_by_teacher', 'booking', v_booking.id, v_booking.student_id,
    to_jsonb(v_before), to_jsonb(v_booking), p_reason
  );
  return v_booking;
end;
$$;

revoke all on function public.invite_student(text, text, text, text, integer)
  from public, anon;
revoke all on function public.reissue_student_claim_code(uuid, integer)
  from public, anon;
revoke all on function public.cancel_own_booking(uuid, text)
  from public, anon;
revoke all on function public.cancel_booking_as_teacher(uuid, text)
  from public, anon;

grant execute on function public.invite_student(text, text, text, text, integer)
  to authenticated;
grant execute on function public.reissue_student_claim_code(uuid, integer)
  to authenticated;
grant execute on function public.cancel_own_booking(uuid, text)
  to authenticated;
grant execute on function public.cancel_booking_as_teacher(uuid, text)
  to authenticated;

commit;
