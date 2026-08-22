-- suzu2 initial classroom schema.
-- New-project schema only: no compatibility tables, compatibility columns, or student data.
-- This migration is intended for a local/development Supabase database first.

begin;

create extension if not exists btree_gist with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'ja'
    constraint profiles_locale_check check (locale in ('ja', 'zh-TW', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references public.profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  nickname text,
  status text not null default 'active'
    constraint students_status_check check (status in ('active', 'paused', 'inactive')),
  timezone text not null default 'Asia/Taipei',
  notes_folder_url text,
  meeting_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_email_not_blank check (btrim(email) <> ''),
  constraint students_full_name_not_blank check (btrim(full_name) <> '')
);

create unique index students_email_lower_uidx on public.students (lower(email));
create index students_status_idx on public.students (status);

create table public.student_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint student_claim_tokens_expiry_check check (expires_at > created_at),
  constraint student_claim_tokens_consumption_check check (
    (consumed_at is null and consumed_by is null)
    or (consumed_at is not null and consumed_by is not null)
  )
);

create unique index student_claim_tokens_one_active_per_student_uidx
  on public.student_claim_tokens (student_id)
  where consumed_at is null;
create index student_claim_tokens_student_id_idx
  on public.student_claim_tokens (student_id);

create table public.teacher_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'teacher'
    constraint teacher_roles_role_check check (role in ('teacher', 'admin')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  constraint teacher_roles_revocation_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null and nullif(btrim(revoke_reason), '') is not null)
  )
);

create unique index teacher_roles_one_active_role_uidx
  on public.teacher_roles (user_id, role)
  where revoked_at is null;
create index teacher_roles_active_user_idx
  on public.teacher_roles (user_id)
  where revoked_at is null;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  lesson_count integer not null
    constraint purchases_lesson_count_positive check (lesson_count > 0),
  source_kind text not null
    constraint purchases_source_kind_check check (source_kind in ('payment', 'manual')),
  source_payment_id uuid,
  idempotency_key uuid not null unique,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint purchases_id_student_key unique (id, student_id),
  constraint purchases_source_payment_key unique (source_payment_id),
  constraint purchases_source_consistency_check check (
    (source_kind = 'payment' and source_payment_id is not null)
    or (source_kind = 'manual' and source_payment_id is null)
  )
);

create index purchases_student_created_idx
  on public.purchases (student_id, created_at desc);

create table public.lesson_credits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  purchase_id uuid not null,
  sequence_no integer not null
    constraint lesson_credits_sequence_positive check (sequence_no > 0),
  status text not null default 'available'
    constraint lesson_credits_status_check
      check (status in ('available', 'reserved', 'completed', 'voided')),
  booking_id uuid,
  reserved_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete restrict,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint lesson_credits_purchase_sequence_key unique (purchase_id, sequence_no),
  constraint lesson_credits_booking_key unique (booking_id),
  constraint lesson_credits_id_student_key unique (id, student_id),
  constraint lesson_credits_purchase_student_fkey
    foreign key (purchase_id, student_id)
    references public.purchases(id, student_id) on delete restrict,
  constraint lesson_credits_state_check check (
    (status = 'available'
      and booking_id is null and reserved_at is null and completed_at is null
      and voided_at is null and voided_by is null and void_reason is null)
    or
    (status = 'reserved'
      and booking_id is not null and reserved_at is not null and completed_at is null
      and voided_at is null and voided_by is null and void_reason is null)
    or
    (status = 'completed'
      and booking_id is not null and reserved_at is not null and completed_at is not null
      and voided_at is null and voided_by is null and void_reason is null)
    or
    (status = 'voided'
      and completed_at is null and voided_at is not null and voided_by is not null
      and nullif(btrim(void_reason), '') is not null)
  )
);

create index lesson_credits_student_status_created_idx
  on public.lesson_credits (student_id, status, created_at, id);
create index lesson_credits_purchase_id_idx
  on public.lesson_credits (purchase_id);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null default 'pending'
    constraint booking_requests_status_check
      check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  idempotency_key uuid not null unique,
  approved_candidate_id uuid unique,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  rejection_reason text,
  constraint booking_requests_id_student_key unique (id, student_id),
  constraint booking_requests_review_state_check check (
    (status = 'pending'
      and approved_candidate_id is null and reviewed_at is null
      and reviewed_by is null and rejection_reason is null)
    or
    (status = 'approved'
      and approved_candidate_id is not null and reviewed_at is not null
      and reviewed_by is not null and rejection_reason is null)
    or
    (status = 'rejected'
      and approved_candidate_id is null and reviewed_at is not null
      and reviewed_by is not null and nullif(btrim(rejection_reason), '') is not null)
    or
    (status = 'cancelled' and approved_candidate_id is null)
  )
);

create index booking_requests_student_status_submitted_idx
  on public.booking_requests (student_id, status, submitted_at desc);
create index booking_requests_pending_submitted_idx
  on public.booking_requests (submitted_at)
  where status = 'pending';

create table public.booking_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    constraint booking_candidates_status_check
      check (status in ('pending', 'selected', 'not_selected', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint booking_candidates_interval_check check (ends_at > starts_at),
  constraint booking_candidates_request_interval_key unique (request_id, starts_at, ends_at),
  constraint booking_candidates_id_request_key unique (id, request_id),
  constraint booking_candidates_id_student_key unique (id, student_id),
  constraint booking_candidates_request_student_fkey
    foreign key (request_id, student_id)
    references public.booking_requests(id, student_id) on delete cascade
);

alter table public.booking_requests
  add constraint booking_requests_approved_candidate_fkey
  foreign key (approved_candidate_id, id)
  references public.booking_candidates(id, request_id)
  deferrable initially deferred;

create index booking_candidates_request_status_idx
  on public.booking_candidates (request_id, status);
create index booking_candidates_student_starts_idx
  on public.booking_candidates (student_id, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.booking_requests(id) on delete restrict,
  candidate_id uuid not null unique,
  student_id uuid not null references public.students(id) on delete restrict,
  lesson_credit_id uuid not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'reserved'
    constraint bookings_status_check check (status in ('reserved', 'completed', 'cancelled')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  constraint bookings_interval_check check (ends_at > starts_at),
  constraint bookings_id_student_key unique (id, student_id),
  constraint bookings_candidate_request_fkey
    foreign key (candidate_id, request_id)
    references public.booking_candidates(id, request_id) on delete restrict,
  constraint bookings_candidate_student_fkey
    foreign key (candidate_id, student_id)
    references public.booking_candidates(id, student_id) on delete restrict,
  constraint bookings_credit_student_fkey
    foreign key (lesson_credit_id, student_id)
    references public.lesson_credits(id, student_id) on delete restrict,
  constraint bookings_state_check check (
    (status = 'reserved'
      and completed_by is null and completed_at is null
      and cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or
    (status = 'completed'
      and completed_by is not null and completed_at is not null
      and cancelled_by is null and cancelled_at is null and cancellation_reason is null)
    or
    (status = 'cancelled'
      and completed_by is null and completed_at is null
      and cancelled_by is not null and cancelled_at is not null
      and nullif(btrim(cancellation_reason), '') is not null)
  ),
  constraint bookings_no_active_time_overlap exclude using gist (
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('reserved', 'completed'))
);

alter table public.lesson_credits
  add constraint lesson_credits_booking_fkey
  foreign key (booking_id, student_id)
  references public.bookings(id, student_id)
  deferrable initially deferred;

create index bookings_student_status_starts_idx
  on public.bookings (student_id, status, starts_at);

create table public.lesson_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  booking_id uuid not null unique,
  lesson_credit_id uuid not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  completed_by uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint lesson_history_interval_check check (ends_at > starts_at),
  constraint lesson_history_booking_student_fkey
    foreign key (booking_id, student_id)
    references public.bookings(id, student_id) on delete restrict,
  constraint lesson_history_credit_student_fkey
    foreign key (lesson_credit_id, student_id)
    references public.lesson_credits(id, student_id) on delete restrict
);

create index lesson_history_student_starts_idx
  on public.lesson_history (student_id, starts_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null default 'pending'
    constraint payments_status_check check (status in ('pending', 'approved', 'rejected')),
  application_mode text not null
    constraint payments_application_mode_check
      check (application_mode in ('grant_new_credits', 'evidence_only')),
  requested_lesson_count integer,
  amount_minor bigint,
  currency text,
  slip_path text,
  slip_mime_type text,
  slip_size_bytes bigint,
  slip_uploaded_by uuid references auth.users(id) on delete restrict,
  idempotency_key uuid not null unique,
  approved_purchase_id uuid unique,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  constraint payments_id_student_key unique (id, student_id),
  constraint payments_lesson_count_check check (
    (application_mode = 'grant_new_credits' and requested_lesson_count > 0)
    or (application_mode = 'evidence_only' and requested_lesson_count is null)
  ),
  constraint payments_amount_check check (amount_minor is null or amount_minor >= 0),
  constraint payments_currency_check check (
    (amount_minor is null and currency is null)
    or (amount_minor is not null and currency ~ '^[A-Z]{3}$')
  ),
  constraint payments_slip_metadata_check check (
    (slip_path is null and slip_mime_type is null and slip_size_bytes is null and slip_uploaded_by is null)
    or
    (slip_path is not null and slip_mime_type is not null and slip_size_bytes > 0 and slip_uploaded_by is not null)
  ),
  constraint payments_review_state_check check (
    (status = 'pending'
      and approved_purchase_id is null and reviewed_by is null
      and reviewed_at is null and rejection_reason is null)
    or
    (status = 'approved' and reviewed_by is not null and reviewed_at is not null
      and rejection_reason is null
      and (
        (application_mode = 'grant_new_credits' and approved_purchase_id is not null)
        or (application_mode = 'evidence_only' and approved_purchase_id is null)
      ))
    or
    (status = 'rejected'
      and approved_purchase_id is null and reviewed_by is not null and reviewed_at is not null
      and nullif(btrim(rejection_reason), '') is not null)
  )
);

alter table public.payments
  add constraint payments_approved_purchase_student_fkey
  foreign key (approved_purchase_id, student_id)
  references public.purchases(id, student_id) on delete restrict
  deferrable initially deferred;

alter table public.purchases
  add constraint purchases_source_payment_student_fkey
  foreign key (source_payment_id, student_id)
  references public.payments(id, student_id) on delete restrict
  deferrable initially deferred;

create index payments_student_status_submitted_idx
  on public.payments (student_id, status, submitted_at desc);
create index payments_pending_submitted_idx
  on public.payments (submitted_at)
  where status = 'pending';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null constraint audit_logs_action_not_blank check (btrim(action) <> ''),
  entity_type text not null constraint audit_logs_entity_type_not_blank check (btrim(entity_type) <> ''),
  entity_id uuid,
  student_id uuid references public.students(id) on delete restrict,
  before_state jsonb,
  after_state jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint audit_logs_state_present_check
    check (before_state is not null or after_state is not null)
);

create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_student_created_idx
  on public.audit_logs (student_id, created_at desc)
  where student_id is not null;
create index audit_logs_actor_created_idx
  on public.audit_logs (actor_user_id, created_at desc)
  where actor_user_id is not null;

commit;
