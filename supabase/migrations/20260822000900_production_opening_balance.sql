-- Production-only one-time data bridge approved on 2026-08-22.
-- It copies active student identity and the current remaining balance into the
-- new ledger. Legacy operational tables remain untouched as an archive.

begin;

do $$
declare
  v_teacher_id uuid;
  v_teacher_count integer;
begin
  if to_regclass('public.classroom_students') is null then
    raise exception 'legacy classroom_students table is required for the production bridge';
  end if;

  select count(*), (array_agg(u.id order by u.id))[1]
  into v_teacher_count, v_teacher_id
  from auth.users u
  where not exists (
    select 1
    from public.classroom_students legacy_student
    where lower(legacy_student.email) = lower(u.email)
  );

  if v_teacher_count <> 1 or v_teacher_id is null then
    raise exception 'expected exactly one non-student Auth user for teacher bootstrap, found %', v_teacher_count;
  end if;

  insert into public.profiles (id, display_name, created_at, updated_at)
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      legacy_student.name
    ),
    coalesce(u.created_at, now()),
    now()
  from public.classroom_students legacy_student
  join auth.users u on lower(u.email) = lower(legacy_student.email)
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.profiles (id, display_name, created_at, updated_at)
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Teacher'
    ),
    coalesce(u.created_at, now()),
    now()
  from auth.users u
  where u.id = v_teacher_id
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.students (
    id,
    auth_user_id,
    email,
    full_name,
    nickname,
    status,
    timezone,
    notes_folder_url,
    meeting_url,
    created_at,
    updated_at
  )
  select
    legacy_student.id,
    matched_user.id,
    lower(btrim(legacy_student.email)),
    legacy_student.name,
    nullif(btrim(legacy_student.nickname), ''),
    case lower(coalesce(legacy_student.status, 'active'))
      when 'active' then 'active'
      when 'paused' then 'paused'
      else 'inactive'
    end,
    coalesce(nullif(btrim(legacy_student.timezone), ''), 'Asia/Taipei'),
    nullif(btrim(legacy_student.drive_folder_url), ''),
    nullif(btrim(legacy_student.meet_link), ''),
    coalesce(legacy_student.created_at, now()),
    now()
  from public.classroom_students legacy_student
  left join auth.users matched_user
    on lower(matched_user.email) = lower(legacy_student.email)
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        email = excluded.email,
        full_name = excluded.full_name,
        nickname = excluded.nickname,
        status = excluded.status,
        timezone = excluded.timezone,
        notes_folder_url = excluded.notes_folder_url,
        meeting_url = excluded.meeting_url,
        updated_at = now();

  insert into public.teacher_roles (user_id, role, granted_by)
  values (v_teacher_id, 'teacher', v_teacher_id)
  on conflict (user_id, role) where revoked_at is null do nothing;

  insert into public.purchases (
    id,
    student_id,
    lesson_count,
    source_kind,
    idempotency_key,
    note,
    created_by,
    created_at
  )
  select
    md5('legacy-opening-purchase:' || legacy_student.id::text)::uuid,
    legacy_student.id,
    legacy_student.remaining_lessons,
    'manual',
    md5('legacy-opening-idempotency:' || legacy_student.id::text)::uuid,
    '旧サイトからの移行時残高（2026-08-22）',
    v_teacher_id,
    now()
  from public.classroom_students legacy_student
  where legacy_student.remaining_lessons > 0
  on conflict (idempotency_key) do nothing;

  insert into public.lesson_credits (
    id,
    student_id,
    purchase_id,
    sequence_no,
    status,
    created_at
  )
  select
    md5(
      'legacy-opening-credit:' || legacy_student.id::text || ':' || credit_number::text
    )::uuid,
    legacy_student.id,
    md5('legacy-opening-purchase:' || legacy_student.id::text)::uuid,
    credit_number,
    'available',
    now()
  from public.classroom_students legacy_student
  cross join lateral generate_series(1, legacy_student.remaining_lessons) credit_number
  where legacy_student.remaining_lessons > 0
  on conflict (purchase_id, sequence_no) do nothing;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    student_id,
    before_state,
    after_state,
    reason
  )
  select
    v_teacher_id,
    'legacy_opening_balance_imported',
    'purchase',
    purchase.id,
    purchase.student_id,
    null,
    jsonb_build_object('available_credits', purchase.lesson_count),
    '承認済み本番移行'
  from public.purchases purchase
  where purchase.idempotency_key = md5(
    'legacy-opening-idempotency:' || purchase.student_id::text
  )::uuid
    and not exists (
      select 1
      from public.audit_logs existing_log
      where existing_log.action = 'legacy_opening_balance_imported'
        and existing_log.entity_type = 'purchase'
        and existing_log.entity_id = purchase.id
    );
end;
$$;

-- Remove legacy email/folder authorization. New UUID ownership policies from
-- 20260822000300 are the only policies allowed for this private bucket.
drop policy if exists "student read own slip" on storage.objects;
drop policy if exists "student upload own slip" on storage.objects;
drop policy if exists "teacher read all slips" on storage.objects;

commit;
