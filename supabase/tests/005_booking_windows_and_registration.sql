-- Development database only. Availability-window, registration-name, and teacher-label tests.
-- Every fixture is rolled back.

begin;

do $$
declare
  v_teacher constant uuid := '15000000-0000-0000-0000-000000000001';
  v_student_user constant uuid := '15000000-0000-0000-0000-000000000002';
  v_invitation jsonb;
  v_student_id uuid;
  v_request public.booking_requests;
  v_outside_request public.booking_requests;
  v_candidate uuid;
  v_booking public.bookings;
  v_windows jsonb;
begin
  insert into auth.users (id) values (v_teacher), (v_student_user);
  insert into public.profiles (id, display_name) values (v_teacher, 'Window Test Teacher');
  insert into public.teacher_roles (user_id, role, granted_by) values (v_teacher, 'teacher', v_teacher);

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_invitation := public.invite_student(
    'window-student@example.invalid',
    '先生だけの呼び名',
    'Asia/Taipei',
    72
  );
  v_student_id := (v_invitation -> 'student' ->> 'id')::uuid;

  if not exists (
    select 1 from public.student_teacher_labels
    where student_id = v_student_id and nickname = '先生だけの呼び名'
  ) then
    raise exception 'teacher-only nickname was not stored separately';
  end if;

  perform public.set_student_teacher_label(v_student_id, '更新した先生用呼び名');
  if not exists (
    select 1 from public.student_teacher_labels
    where student_id = v_student_id and nickname = '更新した先生用呼び名'
  ) then
    raise exception 'teacher could not update a private nickname through RPC';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user::text, true);
  perform public.claim_student_profile(v_invitation ->> 'claim_code', '林さん（登録名）');
  if not exists (
    select 1 from public.students
    where id = v_student_id
      and auth_user_id = v_student_user
      and full_name = '林さん（登録名）'
  ) then
    raise exception 'student-submitted registration name was not stored';
  end if;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform public.register_manual_purchase(
    v_student_id, 4, '35000000-0000-0000-0000-000000000001', 'window tests'
  );

  select jsonb_agg(jsonb_build_object(
    'day_rank', day_rank,
    'time_rank', time_rank,
    'starts_at', timestamptz '2037-01-01T10:00:00Z' + make_interval(days => day_rank - 1, hours => time_rank - 1),
    'ends_at', timestamptz '2037-01-01T11:00:00Z' + make_interval(days => day_rank - 1, hours => time_rank - 1)
  ) order by day_rank, time_rank)
  into v_windows
  from generate_series(1, 5) as d(day_rank)
  cross join generate_series(1, 3) as t(time_rank);

  perform set_config('request.jwt.claim.sub', v_student_user::text, true);
  v_request := public.submit_booking_request(
    v_windows,
    '45000000-0000-0000-0000-000000000001',
    'five dates and three ranges per date'
  );
  if (select count(*) from public.booking_candidates where request_id = v_request.id) <> 15
     or (select count(distinct day_rank) from public.booking_candidates where request_id = v_request.id) <> 5 then
    raise exception 'five-day/three-range submission was not persisted correctly';
  end if;

  select id into strict v_candidate
  from public.booking_candidates
  where request_id = v_request.id and day_rank = 1 and time_rank = 1;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_booking := public.approve_booking_request(
    v_request.id, v_candidate, '2037-01-01T10:00:00Z'
  );
  if v_booking.ends_at - v_booking.starts_at <> interval '50 minutes' then
    raise exception 'approved booking is not exactly 50 minutes';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user::text, true);
  v_outside_request := public.submit_booking_request(
    jsonb_build_array(jsonb_build_object(
      'day_rank', 1, 'time_rank', 1,
      'starts_at', '2037-02-01T19:00:00Z', 'ends_at', '2037-02-01T22:00:00Z'
    )),
    '45000000-0000-0000-0000-000000000002',
    'outside exact-start test'
  );
  select id into strict v_candidate
  from public.booking_candidates where request_id = v_outside_request.id;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  begin
    perform public.approve_booking_request(
      v_outside_request.id, v_candidate, '2037-02-01T18:30:00Z'
    );
    raise exception 'teacher approved a start outside the submitted window';
  exception when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claim.sub', v_student_user::text, true);
  begin
    perform public.submit_booking_request(
      (select jsonb_agg(jsonb_build_object(
        'day_rank', value, 'time_rank', 1,
        'starts_at', timestamptz '2037-03-01T10:00:00Z' + make_interval(days => value - 1),
        'ends_at', timestamptz '2037-03-01T11:00:00Z' + make_interval(days => value - 1)
      )) from generate_series(1, 6) value),
      '45000000-0000-0000-0000-000000000003', 'six dates must fail'
    );
    raise exception 'six candidate dates were unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.submit_booking_request(
      (select jsonb_agg(jsonb_build_object(
        'day_rank', 1, 'time_rank', value,
        'starts_at', timestamptz '2037-04-01T10:00:00Z' + make_interval(hours => value - 1),
        'ends_at', timestamptz '2037-04-01T11:00:00Z' + make_interval(hours => value - 1)
      )) from generate_series(1, 4) value),
      '45000000-0000-0000-0000-000000000004', 'four preferences must fail'
    );
    raise exception 'four time preferences were unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.submit_booking_request(
      jsonb_build_array(jsonb_build_object(
        'day_rank', 1, 'time_rank', 1,
        'starts_at', '2037-05-01T10:15:00Z', 'ends_at', '2037-05-01T11:30:00Z'
      )),
      '45000000-0000-0000-0000-000000000005', 'off-grid minutes must fail'
    );
    raise exception 'off-grid minutes were unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'nickname'
  ) then
    raise exception 'teacher-only nickname remains exposed on students';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.student_teacher_labels) <> 0 then
    raise exception 'student can read the teacher-only nickname';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.student_teacher_labels) <> 1 then
    raise exception 'teacher cannot read the teacher-only nickname';
  end if;
end;
$$;
reset role;

rollback;

select 'BOOKING_WINDOWS_REGISTRATION_TEST=PASS' as result;
