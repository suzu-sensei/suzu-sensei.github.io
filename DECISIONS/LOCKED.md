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
