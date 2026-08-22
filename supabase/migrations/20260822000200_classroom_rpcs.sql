-- suzu2 transactional RPC boundary.
-- Apply only after the initial schema and RLS migrations.

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function private.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_student_id uuid,
  p_before_state jsonb,
  p_after_state jsonb,
  p_reason text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    student_id,
    before_state,
    after_state,
    reason
  ) values (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_student_id,
    p_before_state,
    p_after_state,
    nullif(btrim(p_reason), '')
  );
$$;

revoke all on function private.write_audit(text, text, uuid, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;

create or replace function public.claim_student_profile(p_claim_token text)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.student_claim_tokens;
  v_student public.students;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_claim_token), '') is null then
    raise exception 'claim token required' using errcode = '22023';
  end if;

  select * into v_claim
  from public.student_claim_tokens
  where token_hash = extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256')
  for update;

  if not found or v_claim.consumed_at is not null or v_claim.expires_at <= now() then
    raise exception 'invalid or expired claim token' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where id = v_claim.student_id
  for update;

  if not found then
    raise exception 'student profile not found' using errcode = 'P0002';
  end if;
  if v_student.auth_user_id is not null and v_student.auth_user_id <> v_user_id then
    raise exception 'student profile already claimed' using errcode = '23505';
  end if;

  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    v_student.nickname,
    v_student.full_name
  ) into v_display_name;

  insert into public.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id) do nothing;

  update public.students
  set auth_user_id = v_user_id,
      updated_at = now()
  where id = v_student.id
  returning * into v_student;

  update public.student_claim_tokens
  set consumed_at = now(), consumed_by = v_user_id
  where id = v_claim.id and consumed_at is null;
  if not found then
    raise exception 'claim token was concurrently consumed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'student_profile_claimed', 'student', v_student.id, v_student.id,
    jsonb_build_object('auth_user_id', null),
    jsonb_build_object('auth_user_id', v_user_id),
    null
  );
  return v_student;
end;
$$;

create or replace function public.register_manual_purchase(
  p_student_id uuid,
  p_lesson_count integer,
  p_idempotency_key uuid,
  p_note text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_existing public.purchases;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if p_student_id is null or p_idempotency_key is null then
    raise exception 'student and idempotency key required' using errcode = '22023';
  end if;
  if p_lesson_count is null or p_lesson_count <= 0 or p_lesson_count > 100 then
    raise exception 'lesson count must be between 1 and 100' using errcode = '22023';
  end if;

  perform 1 from public.students where id = p_student_id and status <> 'inactive' for update;
  if not found then
    raise exception 'active student not found' using errcode = 'P0002';
  end if;

  insert into public.purchases (
    student_id, lesson_count, source_kind, idempotency_key, note, created_by
  ) values (
    p_student_id, p_lesson_count, 'manual', p_idempotency_key,
    nullif(btrim(p_note), ''), auth.uid()
  )
  on conflict (idempotency_key) do nothing
  returning * into v_purchase;

  if v_purchase.id is null then
    select * into v_existing
    from public.purchases
    where idempotency_key = p_idempotency_key;
    if v_existing.student_id <> p_student_id
       or v_existing.lesson_count <> p_lesson_count
       or v_existing.source_kind <> 'manual' then
      raise exception 'idempotency key conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  insert into public.lesson_credits (student_id, purchase_id, sequence_no)
  select p_student_id, v_purchase.id, n
  from generate_series(1, p_lesson_count) as n;

  perform private.write_audit(
    'manual_purchase_registered', 'purchase', v_purchase.id, p_student_id,
    null, to_jsonb(v_purchase), p_note
  );
  return v_purchase;
end;
$$;

create or replace function public.register_purchase(
  p_student_id uuid,
  p_lesson_count integer,
  p_idempotency_key uuid,
  p_note text default null
)
returns public.purchases
language sql
security invoker
set search_path = ''
as $$
  select public.register_manual_purchase(
    p_student_id, p_lesson_count, p_idempotency_key, p_note
  );
$$;

create or replace function public.submit_booking_request(
  p_candidates jsonb,
  p_idempotency_key uuid,
  p_note text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := private.current_student_id();
  v_request public.booking_requests;
  v_existing public.booking_requests;
  v_candidate jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_student_id is null then
    raise exception 'student profile not linked' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) < 1
     or jsonb_array_length(p_candidates) > 5 then
    raise exception 'candidates must contain between 1 and 5 items' using errcode = '22023';
  end if;

  perform 1
  from public.students
  where id = v_student_id and status = 'active'
  for update;
  if not found then
    raise exception 'student is not active' using errcode = '42501';
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_starts_at := (v_candidate ->> 'starts_at')::timestamptz;
    v_ends_at := (v_candidate ->> 'ends_at')::timestamptz;
    if v_starts_at <= now() or v_ends_at <= v_starts_at then
      raise exception 'candidate interval must be valid and in the future' using errcode = '22023';
    end if;
    if v_ends_at - v_starts_at > interval '4 hours' then
      raise exception 'candidate interval is too long' using errcode = '22023';
    end if;
  end loop;

  insert into public.booking_requests (student_id, note, idempotency_key)
  values (v_student_id, nullif(btrim(p_note), ''), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_existing
    from public.booking_requests
    where idempotency_key = p_idempotency_key;
    if v_existing.student_id <> v_student_id then
      raise exception 'idempotency key conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  insert into public.booking_candidates (
    request_id, student_id, starts_at, ends_at
  )
  select
    v_request.id,
    v_student_id,
    (value ->> 'starts_at')::timestamptz,
    (value ->> 'ends_at')::timestamptz
  from jsonb_array_elements(p_candidates);

  perform private.write_audit(
    'booking_request_submitted', 'booking_request', v_request.id, v_student_id,
    null, to_jsonb(v_request), null
  );
  return v_request;
end;
$$;

create or replace function public.approve_booking_request(
  p_request_id uuid,
  p_candidate_id uuid
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests;
  v_candidate public.booking_candidates;
  v_credit public.lesson_credits;
  v_booking public.bookings;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;

  select * into v_request
  from public.booking_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;

  if v_request.status = 'approved' then
    select * into strict v_booking
    from public.bookings
    where request_id = v_request.id;
    if v_booking.candidate_id <> p_candidate_id then
      raise exception 'booking request already approved with another candidate' using errcode = '23505';
    end if;
    return v_booking;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'only pending requests can be approved' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.booking_candidates
  where id = p_candidate_id
    and request_id = v_request.id
    and student_id = v_request.student_id
    and status = 'pending'
  for update;
  if not found then
    raise exception 'pending candidate not found for request' using errcode = 'P0002';
  end if;

  select * into v_credit
  from public.lesson_credits
  where student_id = v_request.student_id and status = 'available'
  order by created_at, id
  for update skip locked
  limit 1;
  if not found then
    raise exception 'no available lesson credit' using errcode = 'P0002';
  end if;

  insert into public.bookings (
    request_id, candidate_id, student_id, lesson_credit_id,
    starts_at, ends_at, approved_by
  ) values (
    v_request.id, v_candidate.id, v_request.student_id, v_credit.id,
    v_candidate.starts_at, v_candidate.ends_at, auth.uid()
  ) returning * into v_booking;

  update public.lesson_credits
  set status = 'reserved', booking_id = v_booking.id, reserved_at = now()
  where id = v_credit.id and status = 'available';
  if not found then
    raise exception 'credit was concurrently reserved' using errcode = '40001';
  end if;

  update public.booking_candidates
  set status = case when id = v_candidate.id then 'selected' else 'not_selected' end
  where request_id = v_request.id and status = 'pending';

  update public.booking_requests
  set status = 'approved', approved_candidate_id = v_candidate.id,
      reviewed_at = now(), reviewed_by = auth.uid()
  where id = v_request.id and status = 'pending';
  if not found then
    raise exception 'request was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'booking_request_approved', 'booking', v_booking.id, v_booking.student_id,
    to_jsonb(v_request), to_jsonb(v_booking), null
  );
  return v_booking;
end;
$$;

create or replace function public.reject_booking_request(
  p_request_id uuid,
  p_reason text
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.booking_requests;
  v_request public.booking_requests;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'rejection reason required' using errcode = '22023';
  end if;

  select * into v_before
  from public.booking_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'rejected' then
    return v_before;
  end if;
  if v_before.status <> 'pending' then
    raise exception 'only pending requests can be rejected' using errcode = '22023';
  end if;

  update public.booking_candidates
  set status = 'cancelled'
  where request_id = v_before.id and status = 'pending';

  update public.booking_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(),
      rejection_reason = btrim(p_reason)
  where id = v_before.id and status = 'pending'
  returning * into v_request;
  if not found then
    raise exception 'request was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'booking_request_rejected', 'booking_request', v_request.id, v_request.student_id,
    to_jsonb(v_before), to_jsonb(v_request), p_reason
  );
  return v_request;
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
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

  select * into v_before
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'completed' then
    return v_before;
  end if;
  if v_before.status <> 'reserved' then
    raise exception 'only reserved bookings can be completed' using errcode = '22023';
  end if;

  select * into v_credit
  from public.lesson_credits
  where id = v_before.lesson_credit_id
  for update;
  if not found or v_credit.status <> 'reserved' or v_credit.booking_id <> v_before.id then
    raise exception 'reserved credit does not match booking' using errcode = '23514';
  end if;

  update public.lesson_credits
  set status = 'completed', completed_at = now()
  where id = v_credit.id and status = 'reserved';
  if not found then
    raise exception 'credit was concurrently processed' using errcode = '40001';
  end if;

  update public.bookings
  set status = 'completed', completed_by = auth.uid(), completed_at = now()
  where id = v_before.id and status = 'reserved'
  returning * into v_booking;
  if not found then
    raise exception 'booking was concurrently processed' using errcode = '40001';
  end if;

  insert into public.lesson_history (
    student_id, booking_id, lesson_credit_id, starts_at, ends_at,
    completed_by, completed_at
  ) values (
    v_booking.student_id, v_booking.id, v_booking.lesson_credit_id,
    v_booking.starts_at, v_booking.ends_at, auth.uid(), v_booking.completed_at
  );

  perform private.write_audit(
    'booking_completed', 'booking', v_booking.id, v_booking.student_id,
    to_jsonb(v_before), to_jsonb(v_booking), null
  );
  return v_booking;
end;
$$;

create or replace function public.approve_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.payments;
  v_payment public.payments;
  v_purchase public.purchases;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;

  select * into v_before
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'approved' then
    return v_before;
  end if;
  if v_before.status <> 'pending' then
    raise exception 'only pending payments can be approved' using errcode = '22023';
  end if;

  if v_before.application_mode = 'grant_new_credits' then
    insert into public.purchases (
      student_id, lesson_count, source_kind, source_payment_id,
      idempotency_key, note, created_by
    ) values (
      v_before.student_id, v_before.requested_lesson_count, 'payment', v_before.id,
      v_before.id, 'Credits issued from approved payment', auth.uid()
    ) returning * into v_purchase;

    insert into public.lesson_credits (student_id, purchase_id, sequence_no)
    select v_before.student_id, v_purchase.id, n
    from generate_series(1, v_before.requested_lesson_count) as n;
  end if;

  update public.payments
  set status = 'approved',
      approved_purchase_id = case
        when application_mode = 'grant_new_credits' then v_purchase.id
        else null
      end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = v_before.id and status = 'pending'
  returning * into v_payment;
  if not found then
    raise exception 'payment was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'payment_approved', 'payment', v_payment.id, v_payment.student_id,
    to_jsonb(v_before), to_jsonb(v_payment), null
  );
  return v_payment;
end;
$$;

create or replace function public.reject_payment(
  p_payment_id uuid,
  p_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.payments;
  v_payment public.payments;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'rejection reason required' using errcode = '22023';
  end if;

  select * into v_before
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'rejected' then
    return v_before;
  end if;
  if v_before.status <> 'pending' then
    raise exception 'only pending payments can be rejected' using errcode = '22023';
  end if;

  update public.payments
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      rejection_reason = btrim(p_reason)
  where id = v_before.id and status = 'pending'
  returning * into v_payment;
  if not found then
    raise exception 'payment was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'payment_rejected', 'payment', v_payment.id, v_payment.student_id,
    to_jsonb(v_before), to_jsonb(v_payment), p_reason
  );
  return v_payment;
end;
$$;

create or replace function public.void_credit(
  p_credit_id uuid,
  p_reason text
)
returns public.lesson_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.lesson_credits;
  v_credit public.lesson_credits;
  v_booking public.bookings;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'void reason required' using errcode = '22023';
  end if;

  select * into v_before
  from public.lesson_credits
  where id = p_credit_id
  for update;
  if not found then
    raise exception 'credit not found' using errcode = 'P0002';
  end if;
  if v_before.status = 'voided' then
    return v_before;
  end if;
  if v_before.status = 'completed' then
    raise exception 'completed credit cannot be voided' using errcode = '22023';
  end if;

  if v_before.status = 'reserved' then
    select * into v_booking
    from public.bookings
    where id = v_before.booking_id
    for update;
    if not found or v_booking.status <> 'reserved' then
      raise exception 'reserved booking not found' using errcode = '23514';
    end if;

    update public.bookings
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
        cancellation_reason = btrim(p_reason)
    where id = v_booking.id and status = 'reserved';
    if not found then
      raise exception 'booking was concurrently processed' using errcode = '40001';
    end if;

    update public.booking_candidates
    set status = 'cancelled'
    where id = v_booking.candidate_id and status = 'selected';
  end if;

  update public.lesson_credits
  set status = 'voided', voided_at = now(), voided_by = auth.uid(),
      void_reason = btrim(p_reason)
  where id = v_before.id and status in ('available', 'reserved')
  returning * into v_credit;
  if not found then
    raise exception 'credit was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'credit_voided', 'lesson_credit', v_credit.id, v_credit.student_id,
    to_jsonb(v_before), to_jsonb(v_credit), p_reason
  );
  return v_credit;
end;
$$;

revoke all on function public.claim_student_profile(text) from public, anon;
revoke all on function public.register_manual_purchase(uuid, integer, uuid, text) from public, anon;
revoke all on function public.register_purchase(uuid, integer, uuid, text) from public, anon;
revoke all on function public.submit_booking_request(jsonb, uuid, text) from public, anon;
revoke all on function public.approve_booking_request(uuid, uuid) from public, anon;
revoke all on function public.reject_booking_request(uuid, text) from public, anon;
revoke all on function public.complete_booking(uuid) from public, anon;
revoke all on function public.approve_payment(uuid) from public, anon;
revoke all on function public.reject_payment(uuid, text) from public, anon;
revoke all on function public.void_credit(uuid, text) from public, anon;

grant execute on function public.claim_student_profile(text) to authenticated;
grant execute on function public.register_manual_purchase(uuid, integer, uuid, text) to authenticated;
grant execute on function public.register_purchase(uuid, integer, uuid, text) to authenticated;
grant execute on function public.submit_booking_request(jsonb, uuid, text) to authenticated;
grant execute on function public.approve_booking_request(uuid, uuid) to authenticated;
grant execute on function public.reject_booking_request(uuid, text) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.approve_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
grant execute on function public.void_credit(uuid, text) to authenticated;

commit;
