-- Development database only. All onboarding and cancellation fixtures are rolled back.

begin;

do $$
declare
  v_teacher constant uuid := '11000000-0000-0000-0000-000000000001';
  v_student_user_a constant uuid := '11000000-0000-0000-0000-000000000002';
  v_student_user_b constant uuid := '11000000-0000-0000-0000-000000000003';
  v_student_b constant uuid := '21000000-0000-0000-0000-000000000002';
  v_invitation jsonb;
  v_reissued jsonb;
  v_student_a uuid;
  v_old_code text;
  v_new_code text;
  v_purchase public.purchases;
  v_request_a public.booking_requests;
  v_reuse_request public.booking_requests;
  v_request_b public.booking_requests;
  v_candidate uuid;
  v_booking_a public.bookings;
  v_reuse_booking public.bookings;
  v_booking_b public.bookings;
begin
  insert into auth.users (id)
  values (v_teacher), (v_student_user_a), (v_student_user_b);

  insert into public.profiles (id, display_name)
  values
    (v_teacher, 'Onboarding Teacher'),
    (v_student_user_b, 'Cancellation Student B');

  insert into public.students (id, auth_user_id, email, full_name)
  values (
    v_student_b,
    v_student_user_b,
    'onboarding-b@example.invalid',
    'Cancellation Student B'
  );

  insert into public.teacher_roles (user_id, role, granted_by)
  values (v_teacher, 'teacher', v_teacher);

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_invitation := public.invite_student(
    '  ONBOARDING-A@example.invalid ',
    'Onboarding Student A',
    'A',
    'Asia/Taipei',
    72
  );
  v_student_a := (v_invitation -> 'student' ->> 'id')::uuid;
  v_old_code := v_invitation ->> 'claim_code';

  if v_old_code is null or length(v_old_code) <> 32 then
    raise exception 'invite_student did not return a secure one-time code';
  end if;
  if exists (
    select 1 from public.student_claim_tokens
    where student_id = v_student_a
      and token_hash = convert_to(v_old_code, 'UTF8')
  ) then
    raise exception 'claim code was stored as plaintext';
  end if;
  if not exists (
    select 1 from public.students
    where id = v_student_a and email = 'onboarding-a@example.invalid'
  ) then
    raise exception 'invite_student did not normalize or create the student';
  end if;

  v_reissued := public.reissue_student_claim_code(v_student_a, 24);
  v_new_code := v_reissued ->> 'claim_code';
  if v_new_code = v_old_code then
    raise exception 'claim code reissue returned the old code';
  end if;
  if exists (
    select 1 from public.student_claim_tokens
    where token_hash = extensions.digest(convert_to(v_old_code, 'UTF8'), 'sha256')
      and consumed_at is null
  ) then
    raise exception 'old claim code remained active after reissue';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  begin
    perform public.claim_student_profile(v_old_code);
    raise exception 'old claim code was unexpectedly accepted';
  exception
    when sqlstate '22023' then null;
  end;
  perform public.claim_student_profile(v_new_code);
  if not exists (
    select 1 from public.students
    where id = v_student_a and auth_user_id = v_student_user_a
  ) then
    raise exception 'new claim code did not link Student A';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user_b::text, true);
  begin
    perform public.claim_student_profile(v_new_code);
    raise exception 'consumed claim code was unexpectedly reusable';
  exception
    when sqlstate '22023' then null;
  end;
  begin
    perform public.invite_student('unauthorized@example.invalid', 'Unauthorized');
    raise exception 'student was unexpectedly able to invite another student';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_purchase := public.register_manual_purchase(
    v_student_a,
    1,
    '31000000-0000-0000-0000-000000000001',
    'Student A cancellation credit'
  );
  perform public.register_manual_purchase(
    v_student_b,
    1,
    '31000000-0000-0000-0000-000000000002',
    'Student B deadline credit'
  );

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  v_request_a := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object(
        'starts_at', '2036-04-10T10:00:00Z',
        'ends_at', '2036-04-10T10:50:00Z'
      )
    ),
    '41000000-0000-0000-0000-000000000001',
    'cancellation test'
  );
  begin
    perform public.submit_booking_request(
      jsonb_build_array(
        jsonb_build_object(
          'starts_at', '2036-04-11T10:00:00Z',
          'ends_at', '2036-04-11T10:50:00Z'
        )
      ),
      '41000000-0000-0000-0000-000000000002',
      'must exceed available credit'
    );
    raise exception 'student submitted more pending requests than available credits';
  exception
    when no_data_found then null;
  end;

  select id into strict v_candidate
  from public.booking_candidates
  where request_id = v_request_a.id;
  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_booking_a := public.approve_booking_request(v_request_a.id, v_candidate);

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  perform public.cancel_own_booking(v_booking_a.id, '予定変更');
  perform public.cancel_own_booking(v_booking_a.id, '再送');
  if not exists (
    select 1 from public.bookings
    where id = v_booking_a.id and status = 'cancelled'
  ) or not exists (
    select 1 from public.lesson_credits
    where purchase_id = v_purchase.id and status = 'available' and booking_id is null
  ) then
    raise exception 'student cancellation did not return the credit';
  end if;
  if not exists (
    select 1 from public.booking_requests
    where id = v_request_a.id and status = 'cancelled' and approved_candidate_id is null
  ) then
    raise exception 'student cancellation did not close the request';
  end if;

  -- The cancelled booking remains as history, but its returned credit must be
  -- reservable again without weakening the one-active-booking-per-credit guard.
  v_reuse_request := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object(
        'starts_at', '2036-04-12T10:00:00Z',
        'ends_at', '2036-04-12T10:50:00Z'
      )
    ),
    '41000000-0000-0000-0000-000000000004',
    'reuse returned credit'
  );
  select id into strict v_candidate
  from public.booking_candidates
  where request_id = v_reuse_request.id;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_reuse_booking := public.approve_booking_request(v_reuse_request.id, v_candidate);
  if v_reuse_booking.lesson_credit_id <> v_booking_a.lesson_credit_id then
    raise exception 'cancellation did not reuse the returned credit';
  end if;
  if (
    select count(*)
    from public.bookings
    where lesson_credit_id = v_booking_a.lesson_credit_id
      and status in ('reserved', 'completed')
  ) <> 1 then
    raise exception 'returned credit has more than one active booking';
  end if;
  if not exists (
    select 1 from public.bookings
    where id = v_booking_a.id and status = 'cancelled'
  ) then
    raise exception 'cancelled booking history was not retained';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user_b::text, true);
  v_request_b := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object(
        'starts_at', now() + interval '6 hours',
        'ends_at', now() + interval '6 hours 50 minutes'
      )
    ),
    '41000000-0000-0000-0000-000000000003',
    'deadline test'
  );
  select id into strict v_candidate
  from public.booking_candidates
  where request_id = v_request_b.id;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_booking_b := public.approve_booking_request(v_request_b.id, v_candidate);

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  begin
    perform public.cancel_own_booking(v_booking_b.id, 'other student');
    raise exception 'Student A cancelled Student B booking';
  exception
    when no_data_found then null;
  end;

  perform set_config('request.jwt.claim.sub', v_student_user_b::text, true);
  begin
    perform public.cancel_own_booking(v_booking_b.id, 'too late');
    raise exception 'student cancellation was accepted inside 12 hours';
  exception
    when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform public.cancel_booking_as_teacher(v_booking_b.id, '先生が日程を調整');
  perform public.cancel_booking_as_teacher(v_booking_b.id, '再送');
  if not exists (
    select 1 from public.lesson_credits
    where student_id = v_student_b and status = 'available' and booking_id is null
  ) then
    raise exception 'teacher cancellation did not return Student B credit';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.students) <> 1 then
    raise exception 'Student A can see another student after onboarding';
  end if;
  if exists (
    select 1 from public.bookings
    where student_id = '21000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Student A can see Student B cancelled booking';
  end if;
end;
$$;

reset role;
rollback;

select 'ONBOARDING_CANCELLATION_TEST=PASS' as result;
