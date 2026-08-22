-- Development database only. All fixtures are rolled back.

begin;

do $$
declare
  v_teacher constant uuid := '10000000-0000-0000-0000-000000000001';
  v_student_user_a constant uuid := '10000000-0000-0000-0000-000000000002';
  v_student_user_b constant uuid := '10000000-0000-0000-0000-000000000003';
  v_claim_user constant uuid := '10000000-0000-0000-0000-000000000004';
  v_student_a constant uuid := '20000000-0000-0000-0000-000000000001';
  v_student_b constant uuid := '20000000-0000-0000-0000-000000000002';
  v_claim_student constant uuid := '20000000-0000-0000-0000-000000000003';
  v_purchase_a public.purchases;
  v_purchase_b public.purchases;
  v_request_a public.booking_requests;
  v_request_b public.booking_requests;
  v_reject_request public.booking_requests;
  v_candidate_a uuid;
  v_candidate_b uuid;
  v_booking public.bookings;
  v_payment_new constant uuid := '50000000-0000-0000-0000-000000000001';
  v_payment_evidence constant uuid := '50000000-0000-0000-0000-000000000002';
  v_payment_reject constant uuid := '50000000-0000-0000-0000-000000000003';
  v_credit_to_void uuid;
begin
  insert into auth.users (id)
  values (v_teacher), (v_student_user_a), (v_student_user_b), (v_claim_user);

  insert into public.profiles (id, display_name)
  values
    (v_teacher, 'Test Teacher'),
    (v_student_user_a, 'Student A'),
    (v_student_user_b, 'Student B');

  insert into public.students (id, auth_user_id, email, full_name)
  values
    (v_student_a, v_student_user_a, 'rpc-test-a@example.invalid', 'Student A'),
    (v_student_b, v_student_user_b, 'rpc-test-b@example.invalid', 'Student B'),
    (v_claim_student, null, 'rpc-test-claim@example.invalid', 'Claim Student');

  insert into public.teacher_roles (user_id, role, granted_by)
  values (v_teacher, 'teacher', v_teacher);

  insert into public.student_claim_tokens (
    student_id, token_hash, expires_at, created_by
  ) values (
    v_claim_student,
    extensions.digest(convert_to('one-time-claim-token', 'UTF8'), 'sha256'),
    now() + interval '1 hour',
    v_teacher
  );

  perform set_config('request.jwt.claim.sub', v_claim_user::text, true);
  perform public.claim_student_profile('one-time-claim-token', 'Claimed Registration Name');
  if not exists (
    select 1 from public.students
    where id = v_claim_student and auth_user_id = v_claim_user
  ) then
    raise exception 'claim_student_profile did not link the student';
  end if;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_purchase_a := public.register_manual_purchase(
    v_student_a, 2, '30000000-0000-0000-0000-000000000001', 'initial test credits'
  );
  perform public.register_manual_purchase(
    v_student_a, 2, '30000000-0000-0000-0000-000000000001', 'retry'
  );
  if (select count(*) from public.purchases where idempotency_key = '30000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from public.lesson_credits where purchase_id = v_purchase_a.id) <> 2 then
    raise exception 'manual purchase idempotency failed';
  end if;

  v_purchase_b := public.register_purchase(
    v_student_b, 1, '30000000-0000-0000-0000-000000000002', 'student B test credit'
  );

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  v_request_a := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object('starts_at', '2035-01-10T10:00:00Z', 'ends_at', '2035-01-10T11:00:00Z'),
      jsonb_build_object('starts_at', '2035-01-11T10:00:00Z', 'ends_at', '2035-01-11T11:00:00Z')
    ),
    '40000000-0000-0000-0000-000000000001',
    'booking request A'
  );
  perform public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object('starts_at', '2035-01-10T10:00:00Z', 'ends_at', '2035-01-10T11:00:00Z')
    ),
    '40000000-0000-0000-0000-000000000001',
    'retry'
  );
  if (select count(*) from public.booking_requests where idempotency_key = '40000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from public.booking_candidates where request_id = v_request_a.id) <> 2 then
    raise exception 'booking submission idempotency failed';
  end if;
  select id into strict v_candidate_a
  from public.booking_candidates
  where request_id = v_request_a.id
  order by starts_at
  limit 1;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_booking := public.approve_booking_request(v_request_a.id, v_candidate_a, '2035-01-10T10:00:00Z');
  perform public.approve_booking_request(v_request_a.id, v_candidate_a, '2035-01-10T10:00:00Z');
  if (select count(*) from public.bookings where request_id = v_request_a.id) <> 1
     or (select count(*) from public.lesson_credits where booking_id = v_booking.id and status = 'reserved') <> 1 then
    raise exception 'booking approval idempotency or credit reservation failed';
  end if;

  perform set_config('request.jwt.claim.sub', v_student_user_b::text, true);
  v_request_b := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object('starts_at', '2035-01-10T10:30:00Z', 'ends_at', '2035-01-10T11:30:00Z')
    ),
    '40000000-0000-0000-0000-000000000002',
    'overlap test'
  );
  select id into strict v_candidate_b
  from public.booking_candidates
  where request_id = v_request_b.id;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  begin
    perform public.approve_booking_request(v_request_b.id, v_candidate_b, '2035-01-10T10:30:00Z');
    raise exception 'overlapping booking was unexpectedly approved';
  exception
    when exclusion_violation then null;
  end;
  if exists (select 1 from public.bookings where request_id = v_request_b.id) then
    raise exception 'overlap rejection left a booking behind';
  end if;

  perform public.complete_booking(v_booking.id);
  perform public.complete_booking(v_booking.id);
  if (select count(*) from public.lesson_history where booking_id = v_booking.id) <> 1
     or (select count(*) from public.lesson_credits where booking_id = v_booking.id and status = 'completed') <> 1 then
    raise exception 'booking completion idempotency failed';
  end if;

  begin
    perform public.void_credit(v_booking.lesson_credit_id, 'completed credit must fail');
    raise exception 'completed credit was unexpectedly voided';
  exception
    when sqlstate '22023' then null;
  end;

  insert into public.payments (
    id, student_id, application_mode, requested_lesson_count,
    idempotency_key, submitted_by, slip_path, slip_mime_type,
    slip_size_bytes, slip_uploaded_by, slip_uploaded_at, slip_status
  ) values (
    v_payment_new, v_student_a, 'grant_new_credits', 3,
    '60000000-0000-0000-0000-000000000001', v_student_user_a,
    v_student_a::text || '/' || v_payment_new::text || '/70000000-0000-0000-0000-000000000001.pdf',
    'application/pdf', 100, v_student_user_a, now(), 'uploaded'
  );
  perform public.approve_payment(v_payment_new);
  perform public.approve_payment(v_payment_new);
  if (select count(*) from public.purchases where source_payment_id = v_payment_new) <> 1
     or (select count(*) from public.lesson_credits c join public.purchases p on p.id = c.purchase_id where p.source_payment_id = v_payment_new) <> 3 then
    raise exception 'new-credit payment idempotency failed';
  end if;

  insert into public.payments (
    id, student_id, application_mode, requested_lesson_count,
    idempotency_key, submitted_by, slip_path, slip_mime_type,
    slip_size_bytes, slip_uploaded_by, slip_uploaded_at, slip_status
  ) values (
    v_payment_evidence, v_student_a, 'evidence_only', null,
    '60000000-0000-0000-0000-000000000002', v_student_user_a,
    v_student_a::text || '/' || v_payment_evidence::text || '/70000000-0000-0000-0000-000000000002.pdf',
    'application/pdf', 100, v_student_user_a, now(), 'uploaded'
  );
  perform public.approve_payment(v_payment_evidence);
  perform public.approve_payment(v_payment_evidence);
  if exists (select 1 from public.purchases where source_payment_id = v_payment_evidence) then
    raise exception 'evidence-only payment issued credits';
  end if;

  insert into public.payments (
    id, student_id, application_mode, requested_lesson_count,
    idempotency_key, submitted_by, slip_path, slip_mime_type,
    slip_size_bytes, slip_uploaded_by, slip_uploaded_at, slip_status
  ) values (
    v_payment_reject, v_student_a, 'evidence_only', null,
    '60000000-0000-0000-0000-000000000003', v_student_user_a,
    v_student_a::text || '/' || v_payment_reject::text || '/70000000-0000-0000-0000-000000000003.pdf',
    'application/pdf', 100, v_student_user_a, now(), 'uploaded'
  );
  perform public.reject_payment(v_payment_reject, 'test rejection');
  perform public.reject_payment(v_payment_reject, 'retry');

  perform set_config('request.jwt.claim.sub', v_student_user_a::text, true);
  v_reject_request := public.submit_booking_request(
    jsonb_build_array(
      jsonb_build_object('starts_at', '2035-01-12T10:00:00Z', 'ends_at', '2035-01-12T11:00:00Z')
    ),
    '40000000-0000-0000-0000-000000000003',
    'reject test'
  );
  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  perform public.reject_booking_request(v_reject_request.id, 'test rejection');
  perform public.reject_booking_request(v_reject_request.id, 'retry');

  select id into strict v_credit_to_void
  from public.lesson_credits
  where purchase_id = v_purchase_a.id and status = 'available'
  order by sequence_no
  limit 1;
  perform public.void_credit(v_credit_to_void, 'test void');
  perform public.void_credit(v_credit_to_void, 'retry');
  if (select count(*) from public.lesson_credits where id = v_credit_to_void and status = 'voided') <> 1 then
    raise exception 'credit void idempotency failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.students) <> 1 then
    raise exception 'Student A can see another student';
  end if;
  if exists (
    select 1 from public.students
    where id = '20000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Student A can see Student B';
  end if;
  if exists (
    select 1 from public.lesson_credits
    where student_id = '20000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Student A can see Student B credits';
  end if;

  begin
    update public.lesson_credits
    set status = 'voided'
    where student_id = '20000000-0000-0000-0000-000000000001';
    raise exception 'direct credit update was unexpectedly allowed';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;

select 'RPC_BEHAVIOR_TEST=PASS' as result;
