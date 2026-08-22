-- Development database only. Student settings, links, and inactive-state tests.
-- Every fixture is rolled back.

begin;

do $$
declare
  v_teacher constant uuid := '16000000-0000-0000-0000-000000000001';
  v_student_user constant uuid := '16000000-0000-0000-0000-000000000002';
  v_student_id constant uuid := '26000000-0000-0000-0000-000000000001';
begin
  insert into auth.users (id) values (v_teacher), (v_student_user);
  insert into public.profiles (id, display_name)
  values (v_teacher, 'Access Test Teacher'), (v_student_user, 'Access Test Student');
  insert into public.teacher_roles (user_id, role, granted_by)
  values (v_teacher, 'teacher', v_teacher);
  insert into public.students (id, auth_user_id, email, full_name)
  values (v_student_id, v_student_user, 'access-test@example.invalid', 'Access Test Student');

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform public.update_student_classroom_settings(
    v_student_id,
    'inactive',
    'https://drive.google.com/drive/folders/test-folder',
    'https://meet.google.com/abc-defg-hij'
  );

  if not exists (
    select 1 from public.students
    where id = v_student_id
      and status = 'inactive'
      and notes_folder_url = 'https://drive.google.com/drive/folders/test-folder'
      and meeting_url = 'https://meet.google.com/abc-defg-hij'
  ) then
    raise exception 'teacher settings update was not persisted';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where student_id = v_student_id and action = 'student_classroom_settings_changed'
  ) then
    raise exception 'teacher settings update was not audited';
  end if;

  begin
    perform public.update_student_classroom_settings(
      v_student_id, 'active', 'https://example.com/not-drive', null
    );
    raise exception 'non-Drive URL was unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claim.sub', v_student_user::text, true);
  begin
    perform public.update_student_classroom_settings(v_student_id, 'active', null, null);
    raise exception 'student changed protected classroom settings';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.submit_booking_request(
      jsonb_build_array(jsonb_build_object(
        'day_rank', 1,
        'time_rank', 1,
        'starts_at', '2038-01-01T10:00:00Z',
        'ends_at', '2038-01-01T11:00:00Z'
      )),
      '46000000-0000-0000-0000-000000000001',
      'inactive student must fail'
    );
    raise exception 'inactive student submitted a booking request';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.submit_payment(
      'evidence_only',
      '66000000-0000-0000-0000-000000000001',
      'application/pdf',
      100,
      'pdf',
      null,
      null,
      null,
      null
    );
    raise exception 'inactive student submitted a payment';
  exception when sqlstate 'P0002' then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.students) <> 1 then
    raise exception 'student cannot read the owned profile';
  end if;
  begin
    update public.students set status = 'active';
    raise exception 'student directly updated protected settings';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;

select 'STUDENT_CLASSROOM_ACCESS_TEST=PASS' as result;
