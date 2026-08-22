-- Students provide their own registration name when claiming a profile.
-- Teacher-only nicknames live in a separate RLS-protected table.

begin;

create table public.student_teacher_labels (
  student_id uuid primary key references public.students(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 80),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.student_teacher_labels (student_id, nickname)
select id, btrim(nickname)
from public.students
where nullif(btrim(nickname), '') is not null;

alter table public.student_teacher_labels enable row level security;
alter table public.student_teacher_labels force row level security;

revoke all on public.student_teacher_labels from public, anon, authenticated;
grant select on public.student_teacher_labels to authenticated;

create policy student_teacher_labels_teacher_select
on public.student_teacher_labels
for select
to authenticated
using (private.is_teacher());

drop function public.reissue_student_claim_code(uuid, integer);
drop function public.invite_student(text, text, text, text, integer);
drop function public.claim_student_profile(text);

alter table public.students drop column nickname;

create function public.invite_student(
  p_email text,
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
  if nullif(btrim(p_timezone), '') is null then
    raise exception 'timezone required' using errcode = '22023';
  end if;
  if p_token_ttl_hours is null or p_token_ttl_hours < 1 or p_token_ttl_hours > 168 then
    raise exception 'claim token lifetime must be between 1 and 168 hours' using errcode = '22023';
  end if;
  if p_nickname is not null and char_length(btrim(p_nickname)) > 80 then
    raise exception 'nickname must be 80 characters or fewer' using errcode = '22023';
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
    set timezone = btrim(p_timezone),
        updated_at = now()
    where id = v_student.id
    returning * into v_student;
  else
    insert into public.students (email, full_name, timezone)
    values (v_email, v_email, btrim(p_timezone))
    returning * into v_student;
  end if;

  if nullif(btrim(p_nickname), '') is null then
    delete from public.student_teacher_labels where student_id = v_student.id;
  else
    insert into public.student_teacher_labels (student_id, nickname, updated_by)
    values (v_student.id, btrim(p_nickname), auth.uid())
    on conflict (student_id) do update
    set nickname = excluded.nickname,
        updated_by = auth.uid(),
        updated_at = now();
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

create function public.reissue_student_claim_code(
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
  v_nickname text;
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

  select nickname into v_nickname
  from public.student_teacher_labels
  where student_id = p_student_id;

  return public.invite_student(
    v_student.email,
    v_nickname,
    v_student.timezone,
    p_token_ttl_hours
  );
end;
$$;

create function public.claim_student_profile(
  p_claim_token text,
  p_full_name text
)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.student_claim_tokens;
  v_student public.students;
  v_name text := btrim(p_full_name);
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_claim_token), '') is null then
    raise exception 'claim token required' using errcode = '22023';
  end if;
  if nullif(v_name, '') is null or char_length(v_name) > 120 then
    raise exception 'registration name must contain between 1 and 120 characters' using errcode = '22023';
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

  insert into public.profiles (id, display_name)
  values (v_user_id, v_name)
  on conflict (id) do update set display_name = excluded.display_name;

  update public.students
  set auth_user_id = v_user_id,
      full_name = v_name,
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
    jsonb_build_object('auth_user_id', v_user_id, 'full_name', v_name),
    null
  );
  return v_student;
end;
$$;

revoke all on function public.invite_student(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.reissue_student_claim_code(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_student_profile(text, text)
  from public, anon, authenticated;

grant execute on function public.invite_student(text, text, text, integer) to authenticated;
grant execute on function public.reissue_student_claim_code(uuid, integer) to authenticated;
grant execute on function public.claim_student_profile(text, text) to authenticated;

commit;
