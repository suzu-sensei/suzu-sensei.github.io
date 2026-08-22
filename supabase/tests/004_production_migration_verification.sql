-- Read-only verification for the approved production opening-balance bridge.

do $$
declare
  v_required_tables constant text[] := array[
    'profiles', 'students', 'student_claim_tokens', 'student_teacher_labels', 'teacher_roles',
    'purchases', 'lesson_credits', 'booking_requests', 'booking_candidates',
    'bookings', 'lesson_history', 'payments', 'audit_logs'
  ];
  v_required_rpcs constant text[] := array[
    'claim_student_profile', 'register_manual_purchase',
    'submit_booking_request', 'approve_booking_request',
    'reject_booking_request', 'complete_booking', 'approve_payment',
    'reject_payment', 'void_credit', 'set_student_teacher_label',
    'update_student_classroom_settings'
  ];
begin
  if (
    select count(*)
    from unnest(v_required_tables) table_name
    where to_regclass('public.' || table_name) is not null
  ) <> cardinality(v_required_tables) then
    raise exception 'required production tables are missing';
  end if;

  if (
    select count(*)
    from pg_tables
    where schemaname = 'public'
      and tablename = any(v_required_tables)
      and rowsecurity
  ) <> cardinality(v_required_tables) then
    raise exception 'RLS is not enabled on every required table';
  end if;

  if (
    select count(distinct routine_name)
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name = any(v_required_rpcs)
  ) <> cardinality(v_required_rpcs) then
    raise exception 'required production RPCs are missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'nickname'
  ) then
    raise exception 'teacher-only nickname remains exposed on students';
  end if;

  if to_regprocedure('public.claim_student_profile(text,text)') is null
     or to_regprocedure('public.approve_booking_request(uuid,uuid,timestamp with time zone)') is null
     or to_regprocedure('public.invite_student(text,text,text,integer)') is null
     or to_regprocedure('public.set_student_teacher_label(uuid,text)') is null
     or to_regprocedure('public.update_student_classroom_settings(uuid,text,text,text)') is null then
    raise exception 'current onboarding or booking RPC signatures are missing';
  end if;

  if (select count(*) from public.students)
     <> (select count(*) from public.classroom_students) then
    raise exception 'student bridge count mismatch';
  end if;

  if (
    select count(*)
    from public.students student
    join auth.users auth_user on auth_user.id = student.auth_user_id
  ) <> (
    select count(*)
    from public.classroom_students legacy_student
    join auth.users auth_user on lower(auth_user.email) = lower(legacy_student.email)
  ) then
    raise exception 'student Auth ownership bridge mismatch';
  end if;

  if (
    select count(*)
    from public.lesson_credits
    where status = 'available' and booking_id is null
  ) <> (
    select coalesce(sum(greatest(remaining_lessons, 0)), 0)
    from public.classroom_students
  ) then
    raise exception 'opening credit balance mismatch';
  end if;

  if (select count(*) from public.teacher_roles where revoked_at is null) <> 1 then
    raise exception 'expected one active production teacher role';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'student read own slip',
        'student upload own slip',
        'teacher read all slips'
      )
  ) then
    raise exception 'legacy email-based Storage policies remain installed';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'payment-slips'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      ]::text[]
  ) then
    raise exception 'private payment-slip bucket configuration mismatch';
  end if;
end;
$$;

select 'PRODUCTION_MIGRATION_VERIFICATION=PASS' as result;
