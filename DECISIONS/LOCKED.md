# Locked Decisions

## D-001 — Independent rebuild

- DECISION: Build in this repository; keep `/Users/suzui/suzu-sensei` read-only and selectively rewrite, rather than wholesale-copy, useful behavior.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: REQUIREMENTS.md

## D-002 — Production safety boundary

- DECISION: Do not change production Supabase ref `ploropobmgwlpphtkndo`, commit, or push without separate explicit approval.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: REQUIREMENTS.md

## D-003 — Ledger and authorization model

- DECISION: Credits are ledger rows with four required states; ownership uses auth UUIDs; privileged transitions use transactional RPCs; all applicable tables use RLS.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: REQUIREMENTS.md

## D-004 — Frontend architecture

- DECISION: Use Vite and TypeScript for the new frontend.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: User approval; `DESIGN/ARCHITECTURE.md`

## D-005 — Teacher authorization authority

- DECISION: Use UUID-based `teacher_roles` as the authoritative teacher authorization source.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: User approval; `DESIGN/DATA_MODEL.md`

## D-006 — Development database

- STATUS: SUPERSEDED by D-008
- DECISION: Use local Supabase first for development and destructive testing.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: User approval; `DESIGN/ARCHITECTURE.md`

## D-007 — Visual continuity

- DECISION: Preserve the old site's visual character as closely as practical while rebuilding its implementation.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: User instruction on 2026-08-21

## D-008 — Hosted development Supabase

- DECISION: Do not use Docker or local Supabase. Create and use a new independent hosted Supabase project for schema, RLS, RPC, Storage, and development testing. Production migration remains a separate post-validation phase.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-21
- EVIDENCE: User instruction on 2026-08-21
- SUPERSEDES: D-006

## D-009 — GitHub Pages root transition

- DECISION: Publish the completed new classroom at `https://suzu-sensei.github.io/`. Preserve the currently published old-site snapshot at `https://suzu-sensei.github.io/old/` for reference.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user approval on 2026-08-22
- SCOPE_NOTE: Only the already-published old `origin/main` is archived. Uncommitted local old-site changes and credential-related files remain local and are not published.

## D-010 — Hosting commit and push authorization

- DECISION: Commit and push are authorized for the approved GitHub Pages archival and release preparation. Production Supabase changes remain separately gated.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user approval on 2026-08-22

## D-011 — Production opening-balance migration

- DECISION: Migrate all four legacy student profiles and the current aggregate balance of 27 unused lessons into the new ledger as auditable opening-balance purchases and credits. Keep legacy lesson history, payment, change-request, override, reminder, and quiz records untouched in their existing tables and available through the archived old site; do not transform them into the new runtime model.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit selection of recommended production migration option 1

## D-012 — Restore public home and use a dedicated classroom URL

- DECISION: Keep the original public home, games, textbook, and columns at `https://suzu-sensei.github.io/`. Publish the new role-aware student/teacher portal at `https://suzu-sensei.github.io/classroom/`. Redirect the old student and teacher page URLs to the canonical classroom URL so existing bookmarks continue to work. Keep `/old/` as a rollback reference.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user approval on 2026-08-22
- SUPERSEDES: D-009

## D-013 — Booking availability, identity labels, and student languages

- DECISION: Accept up to five candidate dates per request and up to three ranked availability ranges per date, using only half-hour boundaries. The teacher selects the exact 50-minute start transactionally. The student supplies the registration name during claim; teacher-only nicknames are stored separately behind teacher-only RLS. Student-facing UI supports Japanese, Traditional Chinese, and English; teacher UI remains Japanese.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user instructions on 2026-08-22; `REQUIREMENTS.md`

## D-014 — Production release of the booking/language update

- DECISION: Apply migrations `20260822001000` through `20260822001200` to production ref `ploropobmgwlpphtkndo`, then commit and push the matching frontend and run read-only production verification.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user statement `本番反映を承認します` on 2026-08-22

## D-015 — Student resources, inactive access, and permanent language coverage

- DECISION: Add teacher-managed per-student Google Meet and Drive links, browser-local recording on teacher and student screens, editable active/paused/inactive status, and per-student booked/past lesson controls. Inactive students keep read-only history and links while new booking/payment submission is blocked. HOME and all student-facing screens permanently maintain Japanese, Traditional Chinese, and English parity; teacher UI remains Japanese-only.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user instruction on 2026-08-22; `REQUIREMENTS.md`

## D-016 — Production release of student classroom access

- DECISION: Apply migration `20260822001300_student_classroom_access.sql` to production ref `ploropobmgwlpphtkndo`, verify the production database read-only, then commit and push the matching frontend and documentation.
- APPROVER: Project owner (user)
- APPROVED_ON: 2026-08-22
- EVIDENCE: Explicit user instruction on 2026-08-22 to use the safest release method
