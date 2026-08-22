-- Teacher-managed student classroom access and resource links.
-- Recording remains browser-local and is intentionally not stored in Supabase.

begin;

create function public.update_student_classroom_settings(
  p_student_id uuid,
  p_status text,
  p_notes_folder_url text default null,
  p_meeting_url text default null
)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_before jsonb;
  v_notes_folder_url text := nullif(btrim(p_notes_folder_url), '');
  v_meeting_url text := nullif(btrim(p_meeting_url), '');
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if p_student_id is null then
    raise exception 'student required' using errcode = '22023';
  end if;
  if p_status not in ('active', 'paused', 'inactive') then
    raise exception 'invalid student status' using errcode = '22023';
  end if;
  if v_notes_folder_url is not null
     and v_notes_folder_url !~* '^https://drive\.google\.com(/|$)' then
    raise exception 'Google Drive folder URL must use https://drive.google.com' using errcode = '22023';
  end if;
  if v_meeting_url is not null
     and v_meeting_url !~* '^https://meet\.google\.com(/|$)' then
    raise exception 'Google Meet URL must use https://meet.google.com' using errcode = '22023';
  end if;
  if coalesce(char_length(v_notes_folder_url), 0) > 2048
     or coalesce(char_length(v_meeting_url), 0) > 2048 then
    raise exception 'classroom URL must be 2048 characters or fewer' using errcode = '22023';
  end if;

  select s.* into v_student
  from public.students s
  where s.id = p_student_id
  for update;
  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;
  v_before := to_jsonb(v_student);

  update public.students
  set status = p_status,
      notes_folder_url = v_notes_folder_url,
      meeting_url = v_meeting_url,
      updated_at = now()
  where id = p_student_id
  returning * into v_student;

  perform private.write_audit(
    'student_classroom_settings_changed', 'student', p_student_id, p_student_id,
    v_before,
    to_jsonb(v_student),
    case when p_status = 'inactive' then 'student marked inactive' else null end
  );

  return v_student;
end;
$$;

revoke all on function public.update_student_classroom_settings(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_student_classroom_settings(uuid, text, text, text)
  to authenticated;

commit;
