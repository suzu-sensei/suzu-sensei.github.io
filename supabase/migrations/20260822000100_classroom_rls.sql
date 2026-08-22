-- suzu2 row-level security and client privilege boundary.
-- Apply only after 20260821000100_initial_classroom_schema.sql.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.teacher_roles tr
      where tr.user_id = auth.uid()
        and tr.revoked_at is null
        and tr.role in ('teacher', 'admin')
    ),
    false
  );
$$;

create or replace function private.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.students s
  where s.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function private.owns_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_student_id = private.current_student_id(), false);
$$;

revoke all on function private.is_teacher() from public, anon;
revoke all on function private.current_student_id() from public, anon;
revoke all on function private.owns_student(uuid) from public, anon;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.current_student_id() to authenticated;
grant execute on function private.owns_student(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_claim_tokens enable row level security;
alter table public.teacher_roles enable row level security;
alter table public.purchases enable row level security;
alter table public.lesson_credits enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_candidates enable row level security;
alter table public.bookings enable row level security;
alter table public.lesson_history enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

alter table public.profiles force row level security;
alter table public.students force row level security;
alter table public.student_claim_tokens force row level security;
alter table public.teacher_roles force row level security;
alter table public.purchases force row level security;
alter table public.lesson_credits force row level security;
alter table public.booking_requests force row level security;
alter table public.booking_candidates force row level security;
alter table public.bookings force row level security;
alter table public.lesson_history force row level security;
alter table public.payments force row level security;
alter table public.audit_logs force row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.student_claim_tokens from anon, authenticated;
revoke all on table public.teacher_roles from anon, authenticated;
revoke all on table public.purchases from anon, authenticated;
revoke all on table public.lesson_credits from anon, authenticated;
revoke all on table public.booking_requests from anon, authenticated;
revoke all on table public.booking_candidates from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.lesson_history from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.students to authenticated;
grant select on table public.teacher_roles to authenticated;
grant select on table public.purchases to authenticated;
grant select on table public.lesson_credits to authenticated;
grant select on table public.booking_requests to authenticated;
grant select on table public.booking_candidates to authenticated;
grant select on table public.bookings to authenticated;
grant select on table public.lesson_history to authenticated;
grant select on table public.payments to authenticated;
grant select on table public.audit_logs to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_select_teacher
on public.profiles
for select
to authenticated
using ((select private.is_teacher()));

create policy students_select_own
on public.students
for select
to authenticated
using (auth_user_id = auth.uid());

create policy students_select_teacher
on public.students
for select
to authenticated
using ((select private.is_teacher()));

create policy teacher_roles_select_teacher
on public.teacher_roles
for select
to authenticated
using ((select private.is_teacher()));

create policy purchases_select_own
on public.purchases
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy purchases_select_teacher
on public.purchases
for select
to authenticated
using ((select private.is_teacher()));

create policy lesson_credits_select_own
on public.lesson_credits
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy lesson_credits_select_teacher
on public.lesson_credits
for select
to authenticated
using ((select private.is_teacher()));

create policy booking_requests_select_own
on public.booking_requests
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy booking_requests_select_teacher
on public.booking_requests
for select
to authenticated
using ((select private.is_teacher()));

create policy booking_candidates_select_own
on public.booking_candidates
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy booking_candidates_select_teacher
on public.booking_candidates
for select
to authenticated
using ((select private.is_teacher()));

create policy bookings_select_own
on public.bookings
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy bookings_select_teacher
on public.bookings
for select
to authenticated
using ((select private.is_teacher()));

create policy lesson_history_select_own
on public.lesson_history
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy lesson_history_select_teacher
on public.lesson_history
for select
to authenticated
using ((select private.is_teacher()));

create policy payments_select_own
on public.payments
for select
to authenticated
using ((select private.owns_student(student_id)));

create policy payments_select_teacher
on public.payments
for select
to authenticated
using ((select private.is_teacher()));

create policy audit_logs_select_teacher
on public.audit_logs
for select
to authenticated
using ((select private.is_teacher()));

commit;
