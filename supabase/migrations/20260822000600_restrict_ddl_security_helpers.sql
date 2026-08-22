-- Keep the development database's RLS event trigger internal to database DDL.
-- The helper is optional, so this migration is safe on a clean project too.

begin;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

commit;
