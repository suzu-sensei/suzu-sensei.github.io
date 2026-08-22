# Security and Storage Design

STATUS: APPROVED_FOR_IMPLEMENTATION_SEQUENCE

## Threats in scope

- Student enumeration or retrieval of another student's records.
- Browser attempts to alter credit, booking, payment, or role state directly.
- Concurrent double approval, double reservation, double completion, or double issuance.
- Forged or cross-student Storage paths.
- Teacher privilege derived only from client-visible identity fields.
- Accidental use of production during development.

## RLS baseline

- Enable and force RLS on every public application table where practical.
- Students receive `SELECT` only for rows whose `student_id` equals the student resolved from `auth.uid()`.
- Teachers receive role-scoped reads required by the management UI.
- Do not grant direct `UPDATE` or `DELETE` for protected workflow tables to authenticated clients.
- Prefer RPC-only inserts where ownership, capacity, idempotency, or multi-row consistency must be validated.
- `teacher_roles` and `audit_logs` are not directly writable by ordinary authenticated clients.
- Views use `security_invoker = true` or are avoided.

## Profile claiming

`claim_student_profile` accepts a non-secret one-time claim token or teacher-issued claim code. It must not accept an arbitrary student UUID or email as sufficient proof. The database stores only a hash of the claim token, enforces one active token per student, and consumes it atomically when assigning `auth.uid()`.

The exact claim delivery mechanism remains an implementation detail, but public profile enumeration is prohibited.

## Storage

- Bucket: `payment-slips`, private.
- Object path: `student_id/payment_id/random_uuid.ext`.
- Accepted MIME types and maximum size are validated in both the client and Storage/database policy layer where supported.
- Student upload policy verifies that the first path segment belongs to `auth.uid()` and the second is that student's pending payment.
- Teacher proxy upload verifies an active UUID teacher role and records `uploaded_by`.
- Students may access only their own object. Teachers may access objects needed for payment review.
- Signed URLs are short-lived and obtained through an authorized server/RPC/Edge boundary; object listing does not expose other students' paths.

## Concurrency controls

- Row locks protect mutable state transitions.
- Unique constraints enforce idempotency and one-to-one relationships.
- Composite foreign keys enforce same-student relationships.
- GiST exclusion prevents active booking interval overlap.
- Conditional updates require the expected prior status and fail or return the existing terminal result safely.

## Secret handling

- Supabase publishable keys are public configuration; service-role keys, claim tokens, and provider secrets are never shipped to the browser or committed.
- No credentials or local Claude settings are imported from the old site.
- Production ref `ploropobmgwlpphtkndo` is recorded only as a deny target until production approval.
