-- Make the intentional deny-all boundary for claim token hashes explicit.

begin;

drop policy if exists student_claim_tokens_client_deny_all
  on public.student_claim_tokens;

create policy student_claim_tokens_client_deny_all
on public.student_claim_tokens
for all
to anon, authenticated
using (false)
with check (false);

commit;
