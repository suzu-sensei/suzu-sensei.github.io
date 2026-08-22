# Master Plan

STATUS: APPROVED_SEQUENCE

## Objective

Deliver the secure suzu2 classroom rebuild defined in `REQUIREMENTS.md`.

## Phases

1. Inspect old-site reference behavior and document the new architecture, threat model, state transitions, and implementation choices.
2. Create a new schema migration with constraints and indexes.
3. Add and verify RLS policies.
4. Add transactional RPCs and idempotency protections.
5. Add private Storage policies and signed-URL workflow.
6. Build the student and teacher frontend against the new contract.
7. Run development-environment functional, concurrency, and isolation tests.
8. Perform security review and produce evidence.
9. Request review and resolve findings.
10. Prepare, but do not execute, production migration until explicit approval.

## Dependencies

- Complete the design and resolve relevant pending decisions before implementation.
- Use only a confirmed non-production Supabase target for development changes.
- Obtain separate approval before commit, push, or production change.
