-- Recover safely when the browser cannot finish a private slip upload.

begin;

create or replace function public.mark_payment_slip_upload_failed(p_payment_id uuid)
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
  if v_payment.slip_status = 'missing' then
    return v_payment;
  end if;
  if v_payment.status <> 'pending' or v_payment.slip_status <> 'pending' then
    raise exception 'payment is not awaiting a slip upload' using errcode = '22023';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'payment-slips' and name = v_payment.slip_path
  ) then
    raise exception 'slip object exists and must be confirmed' using errcode = '23514';
  end if;

  update public.payments
  set slip_status = 'missing', slip_uploaded_at = null
  where id = v_payment.id and slip_status = 'pending'
  returning * into v_payment;
  if not found then
    raise exception 'payment slip was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'payment_slip_upload_failed', 'payment', v_payment.id, v_payment.student_id,
    jsonb_build_object('slip_status', 'pending'),
    jsonb_build_object('slip_status', 'missing'),
    'Browser upload did not create a Storage object'
  );
  return v_payment;
end;
$$;

create or replace function public.restart_payment_slip_upload(
  p_payment_id uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_extension text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_extension text := lower(ltrim(btrim(p_extension), '.'));
  v_path text;
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
    raise exception 'old slip object still exists' using errcode = '23514';
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

  v_path := v_payment.student_id::text || '/' || v_payment.id::text || '/'
    || gen_random_uuid()::text || '.' || v_extension;

  update public.payments
  set slip_path = v_path,
      slip_mime_type = p_mime_type,
      slip_size_bytes = p_size_bytes,
      slip_uploaded_by = auth.uid(),
      slip_uploaded_at = null,
      slip_status = 'pending'
  where id = v_payment.id and slip_status = 'missing'
  returning * into v_payment;
  if not found then
    raise exception 'payment slip was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'payment_slip_retry_started', 'payment', v_payment.id, v_payment.student_id,
    jsonb_build_object('slip_status', 'missing'),
    jsonb_build_object('slip_status', 'pending', 'slip_path', v_payment.slip_path),
    null
  );
  return v_payment;
end;
$$;

revoke all on function public.mark_payment_slip_upload_failed(uuid)
  from public, anon;
revoke all on function public.restart_payment_slip_upload(uuid, text, bigint, text)
  from public, anon;

grant execute on function public.mark_payment_slip_upload_failed(uuid)
  to authenticated;
grant execute on function public.restart_payment_slip_upload(uuid, text, bigint, text)
  to authenticated;

commit;
