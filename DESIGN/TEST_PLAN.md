# Development Test Plan

STATUS: PROPOSED_FOR_APPROVAL

## Test layers

- Migration checks: schema objects, constraints, indexes, grants, RLS enabled, functions hardened.
- Database behavior: transaction and concurrency tests using independent authenticated sessions.
- API isolation: Student A, Student B, teacher, and anonymous roles through the Supabase API.
- Storage behavior: own upload/read, cross-student denial, teacher proxy upload, signed URL authorization.
- Browser flows: Google-session handling, student dashboard, teacher review, and safe repeated submissions.

## Mandatory acceptance scenarios

1. Student A receives zero Student B rows from every student-scoped table and cannot access B's slip.
2. Two concurrent approvals of one booking request create one booking and reserve one credit.
3. Two concurrent requests cannot reserve the same credit.
4. Overlapping active intervals fail at the database constraint even under concurrency.
5. Repeated or concurrent lesson completion produces one completed credit and one history row.
6. Repeated or concurrent payment approval creates at most one purchase and the exact configured number of credits.
7. Evidence-only payment approval creates zero purchases and zero credits.
8. Teacher proxy upload succeeds only for an active teacher role and a valid target student/payment path.

## Additional checks

- Anonymous access returns no application data.
- Direct client updates to protected status fields fail.
- Revoked teacher roles lose access after the next database authorization check.
- Invalid candidate ownership, credit ownership, or payment/purchase linkage fails.
- Invalid credit transitions fail and create no partial changes.
- Slip path traversal, wrong student/payment segments, disallowed extensions, and oversized files fail.
- Migration applies from an empty development database and can be reset reproducibly.

## Evidence format

Record each run with migration identifier, environment ref (non-secret), test command, result, timestamp, and relevant failure output. Never record credentials or signed URLs.
