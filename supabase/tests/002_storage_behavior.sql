-- Development database only. All Storage and identity fixtures are rolled back.

begin;

insert into auth.users (id)
values
  ('11000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000003');

insert into public.profiles (id, display_name)
values
  ('11000000-0000-0000-0000-000000000001', 'Storage Teacher'),
  ('11000000-0000-0000-0000-000000000002', 'Storage Student A'),
  ('11000000-0000-0000-0000-000000000003', 'Storage Student B');

insert into public.students (id, auth_user_id, email, full_name)
values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'storage-a@example.invalid', 'Storage Student A'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003', 'storage-b@example.invalid', 'Storage Student B');

insert into public.teacher_roles (user_id, role, granted_by)
values (
  '11000000-0000-0000-0000-000000000001',
  'teacher',
  '11000000-0000-0000-0000-000000000001'
);

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
set local role authenticated;

create temporary table storage_test_ids (
  label text primary key,
  payment_id uuid not null,
  slip_path text not null
) on commit drop;

do $$
declare
  v_payment public.payments;
begin
  v_payment := public.submit_payment(
    'grant_new_credits',
    '31000000-0000-0000-0000-000000000001',
    'image/png', 100, 'png', 2, 50000, 'TWD', null
  );
  insert into storage_test_ids values ('student_a', v_payment.id, v_payment.slip_path);

  begin
    perform public.submit_payment(
      'evidence_only',
      '31000000-0000-0000-0000-000000000011',
      'image/png', 10485761, 'png', null, null, null, null
    );
    raise exception 'oversized slip was unexpectedly accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.submit_payment(
      'evidence_only',
      '31000000-0000-0000-0000-000000000012',
      'image/png', 100, 'pdf', null, null, null, null
    );
    raise exception 'MIME/extension mismatch was unexpectedly accepted';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  v_payment public.payments;
begin
  v_payment := public.submit_payment(
    'evidence_only',
    '31000000-0000-0000-0000-000000000002',
    'application/pdf', 200, 'pdf', null, null, null, null
  );
  insert into storage_test_ids values ('student_b', v_payment.id, v_payment.slip_path);
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  v_payment public.payments;
begin
  v_payment := public.submit_payment(
    'evidence_only',
    '31000000-0000-0000-0000-000000000003',
    'image/jpeg', 300, 'jpg', null, null, null,
    '21000000-0000-0000-0000-000000000002'
  );
  insert into storage_test_ids values ('teacher_proxy_b', v_payment.id, v_payment.slip_path);
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
declare
  v_a storage_test_ids;
  v_b storage_test_ids;
  v_missing public.payments;
  v_old_missing_path text;
  v_updated_object_id uuid;
begin
  select * into strict v_a from storage_test_ids where label = 'student_a';
  select * into strict v_b from storage_test_ids where label = 'student_b';

  insert into storage.objects (bucket_id, name, metadata)
  values (
    'payment-slips', v_a.slip_path,
    jsonb_build_object('mimetype', 'image/png', 'size', 100)
  );

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'payment-slips', v_a.slip_path,
      jsonb_build_object('mimetype', 'image/png', 'size', 100)
    );
    raise exception 'duplicate object path was unexpectedly accepted';
  exception
    when unique_violation then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'payment-slips', v_b.slip_path,
      jsonb_build_object('mimetype', 'application/pdf', 'size', 200)
    );
    raise exception 'Student A uploaded Student B slip';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'payment-slips',
      '21000000-0000-0000-0000-000000000001/99999999-9999-4999-8999-999999999999/99999999-9999-4999-8999-999999999998.png',
      jsonb_build_object('mimetype', 'image/png', 'size', 100)
    );
    raise exception 'object without payment row was unexpectedly accepted';
  exception
    when insufficient_privilege then null;
  end;

  perform public.confirm_payment_slip_upload(v_a.payment_id);
  perform public.confirm_payment_slip_upload(v_a.payment_id);

  if (select count(*) from storage.objects where bucket_id = 'payment-slips') <> 1 then
    raise exception 'Student A cannot select own uploaded slip';
  end if;

  update storage.objects
  set metadata = jsonb_build_object('mimetype', 'image/png', 'size', 999)
  where bucket_id = 'payment-slips' and name = v_a.slip_path
  returning id into v_updated_object_id;
  if v_updated_object_id is not null then
    raise exception 'Storage object overwrite was unexpectedly allowed';
  end if;

  v_missing := public.submit_payment(
    'evidence_only',
    '31000000-0000-0000-0000-000000000004',
    'image/webp', 400, 'webp', null, null, null, null
  );
  begin
    perform public.confirm_payment_slip_upload(v_missing.id);
    raise exception 'row without object was unexpectedly confirmed';
  exception
    when no_data_found then null;
  end;

  v_old_missing_path := v_missing.slip_path;
  v_missing := public.mark_payment_slip_upload_failed(v_missing.id);
  if v_missing.slip_status <> 'missing' then
    raise exception 'failed browser upload was not marked missing';
  end if;
  v_missing := public.restart_payment_slip_upload(
    v_missing.id, 'application/pdf', 450, 'pdf'
  );
  if v_missing.slip_status <> 'pending'
     or v_missing.slip_path = v_old_missing_path
     or v_missing.slip_mime_type <> 'application/pdf'
     or v_missing.slip_size_bytes <> 450 then
    raise exception 'payment slip retry did not issue a fresh safe path';
  end if;
  insert into storage.objects (bucket_id, name, metadata)
  values (
    'payment-slips', v_missing.slip_path,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 450)
  );
  perform public.confirm_payment_slip_upload(v_missing.id);

  begin
    perform public.mark_payment_slip_upload_failed(v_b.payment_id);
    raise exception 'Student A marked Student B upload as failed';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
set local role authenticated;

do $$
declare
  v_b storage_test_ids;
begin
  select * into strict v_b from storage_test_ids where label = 'student_b';
  insert into storage.objects (bucket_id, name, metadata)
  values (
    'payment-slips', v_b.slip_path,
    jsonb_build_object('mimetype', 'application/pdf', 'size', 200)
  );
  perform public.confirm_payment_slip_upload(v_b.payment_id);
  if (select count(*) from storage.objects where bucket_id = 'payment-slips') <> 1 then
    raise exception 'Student B view is not isolated to own slip';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  v_proxy storage_test_ids;
  v_pending public.payments;
begin
  select * into strict v_proxy from storage_test_ids where label = 'teacher_proxy_b';
  insert into storage.objects (bucket_id, name, metadata)
  values (
    'payment-slips', v_proxy.slip_path,
    jsonb_build_object('mimetype', 'image/jpeg', 'size', 300)
  );
  perform public.confirm_payment_slip_upload(v_proxy.payment_id);

  if (
    select count(*)
    from storage.objects
    where bucket_id = 'payment-slips'
      and (
        name like '21000000-0000-0000-0000-000000000001/%'
        or name like '21000000-0000-0000-0000-000000000002/%'
      )
  ) <> 4 then
    raise exception 'teacher cannot view all uploaded slips';
  end if;

  v_pending := public.submit_payment(
    'grant_new_credits',
    '31000000-0000-0000-0000-000000000005',
    'image/png', 500, 'png', 1, null, null,
    '21000000-0000-0000-0000-000000000001'
  );
  begin
    perform public.approve_payment(v_pending.id);
    raise exception 'payment without uploaded object was unexpectedly approved';
  exception
    when check_violation then null;
  end;
  if exists (
    select 1 from public.purchases where source_payment_id = v_pending.id
  ) then
    raise exception 'failed payment approval left purchase behind';
  end if;
end;
$$;

reset role;
rollback;

select 'STORAGE_BEHAVIOR_TEST=PASS' as result;
