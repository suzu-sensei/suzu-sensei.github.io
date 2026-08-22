# Data Model and State Transitions

STATUS: APPROVED_FOR_SCHEMA_IMPLEMENTATION

## Identity

- `profiles`: one row per `auth.users` identity for non-sensitive display preferences shared across roles.
- `students`: classroom student record with nullable unique `auth_user_id`, operational status, timezone, and timestamps.
- `teacher_roles`: UUID-keyed role assignments. Initial proposal: `user_id`, `role`, `granted_by`, `granted_at`, `revoked_at`; active rows authorize teacher actions.

`teacher_roles` is recommended as the authoritative role source because it is auditable and does not require JWT metadata refresh. `app_metadata` may later be a cache or additional assertion, but not the sole source in the initial implementation.

## Ledger

- `purchases`: immutable issuance event with positive `lesson_count`, source type, idempotency key, and optional unique source payment.
- `lesson_credits`: exactly one row per issued lesson, with a unique `(purchase_id, sequence_no)` and status `available | reserved | completed | voided`.
- Cross-student references use composite uniqueness and foreign keys so a booking cannot attach another student's credit.

Credit state rules:

```text
available -> reserved -> completed
available -> voided
reserved  -> available   (approved cancellation/rejection flow)
reserved  -> voided      (teacher exception only if the booking is atomically cancelled)
```

`completed` and `voided` are terminal in the initial design. Corrections append audit evidence rather than silently rewriting history.

## Booking

- `booking_requests`: one student request, its review status, idempotency key, and selected candidate after approval.
- `booking_candidates`: one or more concrete proposed intervals belonging to the same request and student.
- `bookings`: exactly one approved candidate and exactly one reserved credit; one booking per request and candidate.
- Use `starts_at` and `ends_at`, require `ends_at > starts_at`, and apply a GiST exclusion constraint over `[starts_at, ends_at)` for active bookings.
- `lesson_history`: one immutable completion record per booking and credit, enforced with unique indexes.

Approval locks the request and candidate, obtains one available credit deterministically with `FOR UPDATE SKIP LOCKED`, creates the booking, and changes the credit to `reserved` in one transaction. Completion locks the booking and credit, changes both states, and creates one history row in one transaction.

## Payments

- `payments`: submission and review record with `application_mode = grant_new_credits | evidence_only`, unique idempotency key, slip metadata, and optional unique approved purchase.
- New-credit approval creates one purchase and its credit rows, then links the purchase to the payment in one transaction.
- Evidence-only approval sets the review state and never creates or links a purchase.
- A database uniqueness constraint on the payment/purchase relationship and row locking make repeated approval idempotent.

## Audit

- `audit_logs` is included because teacher role grants, credit voiding, payment decisions, and state corrections are security-relevant.
- Audit rows are append-only to clients and record actor UUID, action, entity type/id, before/after JSON, reason, request correlation ID, and timestamp.

## RPC contract

| RPC | Caller | Transactional responsibility |
| --- | --- | --- |
| `claim_student_profile` | student | Link exactly one eligible unclaimed student row to `auth.uid()` without exposing other profiles |
| `register_purchase` | teacher | Create one purchase and N credits idempotently |
| `submit_booking_request` | student | Create owned request and validated candidate rows atomically |
| `approve_booking_request` | teacher | Lock request/candidate/credit, reject overlaps, reserve credit, create booking |
| `reject_booking_request` | teacher | Lock and transition only a pending request |
| `complete_booking` | teacher | Lock booking/credit, complete once, append history |
| `approve_payment` | teacher | Lock payment; optionally issue one purchase/credit set exactly once |
| `reject_payment` | teacher | Lock and reject only a pending payment |
| `void_credit` | teacher | Enforce allowed transition and record mandatory reason/audit |

All security-definer functions set an empty `search_path`, schema-qualify references, validate `auth.uid()`, and have executable privileges granted only to intended roles.
