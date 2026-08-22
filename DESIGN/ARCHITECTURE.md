# Architecture Proposal

STATUS: APPROVED
DATE: 2026-08-21

## Recommended stack

- Frontend: Vite, TypeScript, and framework-free component modules.
- Backend: Supabase Auth, Postgres, PostgREST RPCs, and private Storage.
- Tests: pgTAP or SQL assertions for database invariants; Vitest for client modules; Playwright for authenticated student/teacher flows.
- Development database: a separately named hosted Supabase development project. Docker and local Supabase are not used. Production ref is never linked for development.

This keeps the static-site deployment model of the old site while adding typed modules, repeatable builds, and testable boundaries. No business-critical state transition belongs in browser code.

## Application boundaries

```text
Google Identity / Supabase Auth
            |
            v
Student UI or Teacher UI
  | read own/authorized rows through RLS
  | invoke approved RPCs for state changes
  v
Postgres public API
  | private authorization helpers
  | row locks + constraints + transactions
  v
Ledger, bookings, history, payments
            |
            v
Private payment-slips bucket
```

## Frontend modules

- `auth`: Supabase client, Google login, session refresh, auth-state events, logout.
- `student`: profile claim, credit summary, booking request/candidates, bookings, history, payment submission, slip upload.
- `teacher`: student lookup, purchase registration, booking/payment decisions, lesson completion, voiding credits, signed slip access.
- `shared`: typed RPC boundary, validation, date/time display, localization, error mapping.
- `styles`: new tokens derived selectively from the old pink/purple palette and font choices.

The client may display derived credit totals but never stores a mutable `remaining_lessons` source of truth. Future bookings come only from persisted requests, candidates, and bookings.

## Authentication

Reuse the old flow concept, not its constants:

1. Initialize Supabase from environment-specific public URL and publishable key.
2. Exchange a Google ID token with `signInWithIdToken`, or use Supabase Google OAuth if selected during implementation.
3. Obtain and observe the Supabase session.
4. Resolve student ownership by `auth.uid()` and `students.auth_user_id`.
5. Resolve teacher privilege through the database role helper, never a browser email comparison.

No credential or production configuration is copied from the old repository.

## Deployment boundary

- Build artifacts contain only public Supabase client configuration.
- Development and production use separate environment files and refs.
- Local environment files are ignored by Git.
- Production migration and deployment remain a separately approved phase.

## Rejected architecture

- Directly modernizing the old HTML files: rejected because it retains legacy state and authorization paths.
- Browser-generated weekly schedules: rejected because they are not durable, auditable bookings.
- Email-only teacher checks: rejected because they do not enforce database authorization.
- Mutable lesson-count column: rejected because it cannot reliably prevent double use or preserve provenance.
