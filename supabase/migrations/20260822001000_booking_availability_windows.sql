-- Candidate days contain up to three preferred availability windows.
-- Teachers select an exact half-hour start inside one submitted window.

begin;

alter table public.booking_candidates
  add column day_rank smallint,
  add column time_rank smallint;

with candidate_dates as (
  select
    c.id,
    c.request_id,
    c.starts_at,
    (c.starts_at at time zone s.timezone)::date as local_date
  from public.booking_candidates c
  join public.students s on s.id = c.student_id
), ranked as (
  select
    id,
    dense_rank() over (partition by request_id order by local_date)::smallint as day_rank,
    row_number() over (partition by request_id, local_date order by starts_at, id)::smallint as time_rank
  from candidate_dates
)
update public.booking_candidates c
set day_rank = ranked.day_rank,
    time_rank = ranked.time_rank
from ranked
where ranked.id = c.id;

do $$
begin
  if exists (
    select 1
    from public.booking_candidates
    where day_rank > 5 or time_rank > 3
  ) then
    raise exception 'existing candidates exceed the five-day/three-window limit';
  end if;
end;
$$;

alter table public.booking_candidates
  alter column day_rank set not null,
  alter column time_rank set not null,
  add constraint booking_candidates_day_rank_check check (day_rank between 1 and 5),
  add constraint booking_candidates_time_rank_check check (time_rank between 1 and 3),
  add constraint booking_candidates_request_day_time_key unique (request_id, day_rank, time_rank),
  add constraint booking_candidates_half_hour_window_check check (
    extract(minute from starts_at)::integer in (0, 30)
    and extract(second from starts_at) = 0
    and extract(minute from ends_at)::integer in (0, 30)
    and extract(second from ends_at) = 0
  ) not valid;

create index booking_candidates_request_day_time_idx
  on public.booking_candidates (request_id, day_rank, time_rank);

create or replace function public.submit_booking_request(
  p_candidates jsonb,
  p_idempotency_key uuid,
  p_note text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := private.current_student_id();
  v_student_timezone text;
  v_request public.booking_requests;
  v_existing public.booking_requests;
  v_candidate jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_day_rank smallint;
  v_time_rank smallint;
  v_index integer := 0;
begin
  if v_student_id is null then
    raise exception 'student profile not linked' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) < 1
     or jsonb_array_length(p_candidates) > 15 then
    raise exception 'availability windows must contain between 1 and 15 items' using errcode = '22023';
  end if;

  select timezone into v_student_timezone
  from public.students
  where id = v_student_id and status = 'active'
  for update;
  if not found then
    raise exception 'student is not active' using errcode = '42501';
  end if;

  insert into public.booking_requests (student_id, note, idempotency_key)
  values (v_student_id, nullif(btrim(p_note), ''), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_existing
    from public.booking_requests
    where idempotency_key = p_idempotency_key;
    if v_existing.student_id <> v_student_id then
      raise exception 'idempotency key conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_index := v_index + 1;
    v_day_rank := coalesce((v_candidate ->> 'day_rank')::smallint, v_index::smallint);
    v_time_rank := coalesce((v_candidate ->> 'time_rank')::smallint, 1::smallint);
    v_starts_at := (v_candidate ->> 'starts_at')::timestamptz;
    v_ends_at := (v_candidate ->> 'ends_at')::timestamptz;

    if v_day_rank not between 1 and 5 or v_time_rank not between 1 and 3 then
      raise exception 'candidate rank is outside the allowed range' using errcode = '22023';
    end if;
    if v_starts_at is null or v_ends_at is null
       or v_starts_at <= now() or v_ends_at <= v_starts_at then
      raise exception 'availability window must be valid and in the future' using errcode = '22023';
    end if;
    if v_ends_at - v_starts_at < interval '50 minutes'
       or v_ends_at - v_starts_at > interval '4 hours' then
      raise exception 'availability window must be between 50 minutes and 4 hours' using errcode = '22023';
    end if;
    if extract(minute from v_starts_at)::integer not in (0, 30)
       or extract(second from v_starts_at) <> 0
       or extract(minute from v_ends_at)::integer not in (0, 30)
       or extract(second from v_ends_at) <> 0 then
      raise exception 'availability window must use 00 or 30 minute boundaries' using errcode = '22023';
    end if;
    if (v_starts_at at time zone v_student_timezone)::date
       <> (v_ends_at at time zone v_student_timezone)::date then
      raise exception 'availability window must start and end on the same local date' using errcode = '22023';
    end if;

    insert into public.booking_candidates (
      request_id, student_id, starts_at, ends_at, day_rank, time_rank
    ) values (
      v_request.id, v_student_id, v_starts_at, v_ends_at, v_day_rank, v_time_rank
    );
  end loop;

  if exists (
    select 1
    from public.booking_candidates
    where request_id = v_request.id
    group by day_rank
    having count(distinct (starts_at at time zone v_student_timezone)::date) <> 1
       or min(time_rank) <> 1
       or max(time_rank) <> count(*)
  ) then
    raise exception 'each candidate day must contain sequential preferences for one local date' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.booking_candidates
    where request_id = v_request.id
    group by (starts_at at time zone v_student_timezone)::date
    having count(distinct day_rank) <> 1
  ) then
    raise exception 'the same local date cannot be submitted as two candidate days' using errcode = '22023';
  end if;

  if (
    select max(day_rank)
    from public.booking_candidates
    where request_id = v_request.id
  ) <> (
    select count(distinct day_rank)
    from public.booking_candidates
    where request_id = v_request.id
  ) then
    raise exception 'candidate day ranks must be sequential' using errcode = '22023';
  end if;

  perform private.write_audit(
    'booking_request_submitted', 'booking_request', v_request.id, v_student_id,
    null, to_jsonb(v_request), null
  );
  return v_request;
end;
$$;

drop function public.approve_booking_request(uuid, uuid);

create function public.approve_booking_request(
  p_request_id uuid,
  p_candidate_id uuid,
  p_starts_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests;
  v_candidate public.booking_candidates;
  v_credit public.lesson_credits;
  v_booking public.bookings;
  v_ends_at timestamptz := p_starts_at + interval '50 minutes';
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if p_starts_at is null
     or extract(minute from p_starts_at)::integer not in (0, 30)
     or extract(second from p_starts_at) <> 0 then
    raise exception 'lesson start must be on the hour or half hour' using errcode = '22023';
  end if;

  select * into v_request
  from public.booking_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;

  if v_request.status = 'approved' then
    select * into strict v_booking
    from public.bookings
    where request_id = v_request.id;
    if v_booking.candidate_id <> p_candidate_id or v_booking.starts_at <> p_starts_at then
      raise exception 'booking request already approved with another candidate or start time' using errcode = '23505';
    end if;
    return v_booking;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'only pending requests can be approved' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.booking_candidates
  where id = p_candidate_id
    and request_id = v_request.id
    and student_id = v_request.student_id
    and status = 'pending'
  for update;
  if not found then
    raise exception 'pending candidate not found for request' using errcode = 'P0002';
  end if;
  if p_starts_at < v_candidate.starts_at or v_ends_at > v_candidate.ends_at then
    raise exception 'selected lesson time must fit inside the submitted availability window' using errcode = '22023';
  end if;

  select * into v_credit
  from public.lesson_credits
  where student_id = v_request.student_id and status = 'available'
  order by created_at, id
  for update skip locked
  limit 1;
  if not found then
    raise exception 'no available lesson credit' using errcode = 'P0002';
  end if;

  insert into public.bookings (
    request_id, candidate_id, student_id, lesson_credit_id,
    starts_at, ends_at, approved_by
  ) values (
    v_request.id, v_candidate.id, v_request.student_id, v_credit.id,
    p_starts_at, v_ends_at, auth.uid()
  ) returning * into v_booking;

  update public.lesson_credits
  set status = 'reserved', booking_id = v_booking.id, reserved_at = now()
  where id = v_credit.id and status = 'available';
  if not found then
    raise exception 'credit was concurrently reserved' using errcode = '40001';
  end if;

  update public.booking_candidates
  set status = case when id = v_candidate.id then 'selected' else 'not_selected' end
  where request_id = v_request.id and status = 'pending';

  update public.booking_requests
  set status = 'approved', approved_candidate_id = v_candidate.id,
      reviewed_at = now(), reviewed_by = auth.uid()
  where id = v_request.id and status = 'pending';
  if not found then
    raise exception 'request was concurrently processed' using errcode = '40001';
  end if;

  perform private.write_audit(
    'booking_request_approved', 'booking', v_booking.id, v_booking.student_id,
    to_jsonb(v_request), to_jsonb(v_booking), null
  );
  return v_booking;
end;
$$;

revoke all on function public.submit_booking_request(jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.approve_booking_request(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.submit_booking_request(jsonb, uuid, text) to authenticated;
grant execute on function public.approve_booking_request(uuid, uuid, timestamptz) to authenticated;

commit;
