begin;

-- A cancelled booking remains as audit history, but its returned credit must be
-- available for a later booking. Keep the double-use guard on active/consumed
-- bookings only.
alter table public.bookings
  drop constraint if exists bookings_lesson_credit_id_key;

create unique index if not exists bookings_one_active_per_credit_idx
  on public.bookings (lesson_credit_id)
  where status in ('reserved', 'completed');

commit;
