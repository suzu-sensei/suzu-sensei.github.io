-- Teachers may add, change, or clear their private label for any student.

begin;

create function public.set_student_teacher_label(
  p_student_id uuid,
  p_nickname text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_before jsonb;
  v_nickname text := nullif(btrim(p_nickname), '');
begin
  if not private.is_teacher() then
    raise exception 'teacher authorization required' using errcode = '42501';
  end if;
  if p_student_id is null then
    raise exception 'student required' using errcode = '22023';
  end if;
  if v_nickname is not null and char_length(v_nickname) > 80 then
    raise exception 'nickname must be 80 characters or fewer' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where id = p_student_id
  for update;
  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;

  select to_jsonb(label) into v_before
  from public.student_teacher_labels label
  where student_id = p_student_id;

  if v_nickname is null then
    delete from public.student_teacher_labels where student_id = p_student_id;
  else
    insert into public.student_teacher_labels (student_id, nickname, updated_by)
    values (p_student_id, v_nickname, auth.uid())
    on conflict (student_id) do update
    set nickname = excluded.nickname,
        updated_by = auth.uid(),
        updated_at = now();
  end if;

  perform private.write_audit(
    'student_teacher_label_changed', 'student', p_student_id, p_student_id,
    v_before,
    case when v_nickname is null then null else jsonb_build_object(
      'student_id', p_student_id,
      'nickname', v_nickname
    ) end,
    null
  );

  return jsonb_build_object('student_id', p_student_id, 'nickname', v_nickname);
end;
$$;

revoke all on function public.set_student_teacher_label(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_student_teacher_label(uuid, text)
  to authenticated;

commit;
