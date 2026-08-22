-- suzu2 private payment-slip Storage boundary.
-- Bucket limit: 10 MiB. Allowed types: JPEG, PNG, WebP, PDF.

begin;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'payment-slips',
  'payment-slips',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.payments
  add column if not exists slip_status text not null default 'none',
  add column if not exists slip_uploaded_at timestamptz;

alter table public.payments
  drop constraint if exists payments_slip_metadata_check;

alter table public.payments
  add constraint payments_slip_status_check
    check (slip_status in ('none', 'pending', 'uploaded', 'missing')),
  add constraint payments_slip_metadata_check check (
    (slip_status = 'none'
      and slip_path is null and slip_mime_type is null
      and slip_size_bytes is null and slip_uploaded_by is null
      and slip_uploaded_at is null)
    or
    (slip_status in ('pending', 'missing')
      and slip_path is not null and slip_mime_type is not null
      and slip_size_bytes > 0 and slip_uploaded_by is not null
      and slip_uploaded_at is null)
    or
    (slip_status = 'uploaded'
      and slip_path is not null and slip_mime_type is not null
      and slip_size_bytes > 0 and slip_uploaded_by is not null
      and slip_uploaded_at is not null)
  ),
  add constraint payments_slip_size_limit_check
    check (slip_size_bytes is null or slip_size_bytes <= 10485760),
  add constraint payments_slip_mime_type_check
    check (
      slip_mime_type is null
      or slip_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    ),
  add constraint payments_slip_path_check check (
    slip_path is null
    or (
      slip_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
      and split_part(slip_path, '/', 1) = student_id::text
      and split_part(slip_path, '/', 2) = id::text
    )
  ),
  add constraint payments_approval_requires_uploaded_slip_check
    check (status <> 'approved' or slip_status = 'uploaded');

create or replace function public.submit_payment(
  p_application_mode text,
  p_idempotency_key uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_extension text,
  p_requested_lesson_count integer default null,
  p_amount_minor bigint default null,
  p_currency text default null,
  p_student_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_student uuid := private.current_student_id();
  v_target_student uuid;
  v_is_teacher boolean := private.is_teacher();
  v_extension text := lower(ltrim(btrim(p_extension), '.'));
  v_payment_id uuid := gen_random_uuid();
  v_path text;
  v_payment public.payments;
  v_existing public.payments;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_is_teacher then
    v_target_student := coalesce(p_student_id, v_caller_student);
  else
    if v_caller_student is null then
      raise exception 'student profile not linked' using errcode = '42501';
    end if;
    if p_student_id is not null and p_student_id <> v_caller_student then
      raise exception 'cannot submit payment for another student' using errcode = '42501';
    end if;
    v_target_student := v_caller_student;
  end if;

  if v_target_student is null or p_idempotency_key is null then
    raise exception 'student and idempotency key required' using errcode = '22023';
  end if;
  perform 1
  from public.students
  where id = v_target_student and status <> 'inactive'
  for update;
  if not found then
    raise exception 'active student not found' using errcode = 'P0002';
  end if;

  if p_application_mode not in ('grant_new_credits', 'evidence_only') then
    raise exception 'invalid application mode' using errcode = '22023';
  end if;
  if (p_application_mode = 'grant_new_credits'
      and (p_requested_lesson_count is null or p_requested_lesson_count <= 0 or p_requested_lesson_count > 100))
     or (p_application_mode = 'evidence_only' and p_requested_lesson_count is not null) then
    raise exception 'invalid requested lesson count for application mode' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'slip size must be between 1 byte and 10 MiB' using errcode = '22023';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'unsupported slip MIME type' using errcode = '22023';
  end if;
  if not (
    (p_mime_type = 'image/jpeg' and v_extension in ('jpg', 'jpeg'))
    or (p_mime_type = 'image/png' and v_extension = 'png')
    or (p_mime_type = 'image/webp' and v_extension = 'webp')
    or (p_mime_type = 'application/pdf' and v_extension = 'pdf')
  ) then
    raise exception 'file extension does not match MIME type' using errcode = '22023';
  end if;

  v_path := v_target_student::text || '/' || v_payment_id::text || '/'
    || gen_random_uuid()::text || '.' || v_extension;

  insert into public.payments (
    id, student_id, application_mode, requested_lesson_count,
    amount_minor, currency, idempotency_key, submitted_by,
    slip_path, slip_mime_type, slip_size_bytes, slip_uploaded_by, slip_status
  ) values (
    v_payment_id, v_target_student, p_application_mode, p_requested_lesson_count,
    p_amount_minor, upper(p_currency), p_idempotency_key, v_caller,
    v_path, p_mime_type, p_size_bytes, v_caller, 'pending'
  )
  on conflict (idempotency_key) do nothing
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_existing
    from public.payments
    where idempotency_key = p_idempotency_key;
    if v_existing.student_id <> v_target_student
       or v_existing.application_mode <> p_application_mode
       or v_existing.requested_lesson_count is distinct from p_requested_lesson_count
       or v_existing.slip_mime_type <> p_mime_type
       or v_existing.slip_size_bytes <> p_size_bytes then
      raise exception 'idempotency key conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  perform private.write_audit(
    'payment_submitted', 'payment', v_payment.id, v_payment.student_id,
    null, to_jsonb(v_payment), null
  );
  return v_payment;
end;
$$;

create or replace function public.confirm_payment_slip_upload(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_object storage.objects;
  v_object_mime text;
  v_object_size bigint;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if not private.is_teacher() and not private.owns_student(v_payment.student_id) then
    raise exception 'payment access denied' using errcode = '42501';
  end if;
  if v_payment.slip_status = 'uploaded' then
    return v_payment;
  end if;
  if v_payment.status <> 'pending' or v_payment.slip_status <> 'pending' then
    raise exception 'payment is not awaiting a slip upload' using errcode = '22023';
  end if;

  select * into v_object
  from storage.objects
  where bucket_id = 'payment-slips' and name = v_payment.slip_path
  for update;
  if not found then
    raise exception 'uploaded slip object not found' using errcode = 'P0002';
  end if;

  v_object_mime := coalesce(
    v_object.metadata ->> 'mimetype',
    v_object.metadata ->> 'contentType'
  );
  v_object_size := coalesce(
    nullif(v_object.metadata ->> 'size', '')::bigint,
    nullif(v_object.metadata ->> 'contentLength', '')::bigint
  );
  if v_object_mime is distinct from v_payment.slip_mime_type
     or v_object_size is distinct from v_payment.slip_size_bytes then
    raise exception 'uploaded slip metadata does not match payment' using errcode = '23514';
  end if;

  update public.payments
  set slip_status = 'uploaded', slip_uploaded_at = now()
  where id = v_payment.id and slip_status = 'pending'
  returning * into v_payment;
  if not found then
    raise exception 'payment slip was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'payment_slip_uploaded', 'payment', v_payment.id, v_payment.student_id,
    jsonb_build_object('slip_status', 'pending'),
    jsonb_build_object('slip_status', 'uploaded'),
    null
  );
  return v_payment;
end;
$$;

create or replace function public.mark_payment_slip_missing(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if v_payment.slip_status = 'missing' then
    return v_payment;
  end if;
  if v_payment.status <> 'pending' or v_payment.slip_status <> 'uploaded' then
    raise exception 'only a pending payment with uploaded slip can be marked missing' using errcode = '22023';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'payment-slips' and name = v_payment.slip_path
  ) then
    raise exception 'slip object still exists' using errcode = '23514';
  end if;

  update public.payments
  set slip_status = 'missing', slip_uploaded_at = null
  where id = v_payment.id
  returning * into v_payment;

  perform private.write_audit(
    'payment_slip_marked_missing', 'payment', v_payment.id, v_payment.student_id,
    jsonb_build_object('slip_status', 'uploaded'),
    jsonb_build_object('slip_status', 'missing'),
    'Storage object not found'
  );
  return v_payment;
end;
$$;

create or replace function public.retry_payment_slip_upload(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  if not private.is_teacher() and not private.owns_student(v_payment.student_id) then
    raise exception 'payment access denied' using errcode = '42501';
  end if;
  if v_payment.status <> 'pending' or v_payment.slip_status <> 'missing' then
    raise exception 'payment slip is not marked missing' using errcode = '22023';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'payment-slips' and name = v_payment.slip_path
  ) then
    raise exception 'slip object already exists' using errcode = '23505';
  end if;

  update public.payments
  set slip_status = 'pending'
  where id = v_payment.id
  returning * into v_payment;

  perform private.write_audit(
    'payment_slip_retry_started', 'payment', v_payment.id, v_payment.student_id,
    jsonb_build_object('slip_status', 'missing'),
    jsonb_build_object('slip_status', 'pending'),
    null
  );
  return v_payment;
end;
$$;

drop policy if exists payment_slips_insert_authorized on storage.objects;
drop policy if exists payment_slips_select_authorized on storage.objects;

create policy payment_slips_insert_authorized
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-slips'
  and exists (
    select 1
    from public.payments p
    where p.slip_path = name
      and p.status = 'pending'
      and p.slip_status = 'pending'
      and p.slip_uploaded_by = auth.uid()
      and (
        private.owns_student(p.student_id)
        or private.is_teacher()
      )
  )
);

create policy payment_slips_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-slips'
  and exists (
    select 1
    from public.payments p
    where p.slip_path = name
      and p.slip_status = 'uploaded'
      and (
        private.owns_student(p.student_id)
        or private.is_teacher()
      )
  )
);

revoke all on function public.submit_payment(text, uuid, text, bigint, text, integer, bigint, text, uuid)
  from public, anon;
revoke all on function public.confirm_payment_slip_upload(uuid) from public, anon;
revoke all on function public.mark_payment_slip_missing(uuid) from public, anon;
revoke all on function public.retry_payment_slip_upload(uuid) from public, anon;

grant execute on function public.submit_payment(text, uuid, text, bigint, text, integer, bigint, text, uuid)
  to authenticated;
grant execute on function public.confirm_payment_slip_upload(uuid) to authenticated;
grant execute on function public.mark_payment_slip_missing(uuid) to authenticated;
grant execute on function public.retry_payment_slip_upload(uuid) to authenticated;

commit;
