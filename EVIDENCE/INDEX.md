# Evidence Index

## E-001 — Repository baseline

- SOURCE: Local Git inspection
- DATE: 2026-08-21
- RESULT: New repository on `main`, no commits, no remote, no product files before governance setup.

## E-002 — Old-site reference inventory

- SOURCE: Read-only filesystem inspection of `/Users/suzui/suzu-sensei`
- DATE: 2026-08-21
- RESULT: Required auth, theme, student/teacher UI, SQL drafts, and migrations are present. Credential and excluded legacy artifacts were identified but not imported.

## E-003 — Design pre-work gate

- SOURCE: Governance, Git, toolchain, and old-site read-only inspection
- DATE: 2026-08-21
- RESULT: READY for design only. Requirements and repository identity are consistent; old-site uncommitted work is preserved; new repository has no remote or commits; implementation remains blocked on pending design decisions and a confirmed non-production Supabase target.

## E-004 — Old implementation findings

- SOURCE: Read-only inspection of classroom auth, UI, drafts, and migrations
- DATE: 2026-08-21
- RESULT: Reusable concepts include Supabase Google session exchange, composite ownership constraints, GiST overlap exclusion, row-locked RPC transitions, idempotency keys, RLS, and private slip policies. Excluded legacy counters, fixed-email authorization, browser-generated schedules, legacy fallbacks, and student-specific migration data were not imported.

## E-005 — Initial schema migration

- SOURCE: `supabase/migrations/20260821000100_initial_classroom_schema.sql`
- DATE: 2026-08-21
- RESULT: STATIC CHECK PASSED; NOT YET EXECUTED. All required tables and four credit states are present; same-student composite foreign keys, uniqueness/idempotency constraints, booking overlap exclusion, and supporting indexes were detected. No excluded compatibility identifiers or production ref are present.

## E-006 — Hosted development schema verification

- SOURCE: Supabase SQL Editor on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. Migration completed successfully; 12/12 required tables, 6/6 sampled critical constraints, 4/4 sampled critical indexes, and RLS enabled on 12/12 application tables.
- PRODUCTION_BOUNDARY: Production ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-007 — Hosted development RLS structural verification

- SOURCE: `supabase/migrations/20260822000100_classroom_rls.sql` and Supabase SQL Editor on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. RLS enabled and forced on 12/12 application tables; 20 policies installed; anonymous table grants 0; authenticated direct write grants 0.
- LIMITATION: Student A/B authenticated behavioral isolation remains pending until test identities and RPC fixture setup exist.
- PRODUCTION_BOUNDARY: Production ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-008 — Hosted development RPC verification

- SOURCE: `supabase/migrations/20260822000200_classroom_rpcs.sql`, `supabase/tests/001_rpc_behavior.sql`, and Supabase SQL Editor on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. Ten public RPCs exist with fixed search paths; nine state-changing entry points are security definers; public/anon execute grants are zero and authenticated grants cover all ten RPCs. Transaction-and-rollback behavior tests passed for claim, purchase idempotency, booking submission/approval/rejection, overlap rejection, single-credit reservation, single completion/history, payment issuance idempotency, evidence-only approval, payment rejection, credit voiding, Student A/B isolation, and direct-update denial.
- CLEANUP: Test transaction rolled back; Auth users, students, purchases, bookings, payments, and audit logs returned to zero rows.
- LIMITATION: True simultaneous multi-connection race tests remain part of the later development test stage; row locks, conditional updates, uniqueness constraints, and exclusion constraints are installed now.
- PRODUCTION_BOUNDARY: Production ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-009 — Hosted development private payment-slip Storage verification

- SOURCE: `supabase/migrations/20260822000300_payment_slip_storage.sql`, `supabase/tests/002_storage_behavior.sql`, and Supabase SQL Editor on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. The private `payment-slips` bucket has a 10 MiB limit and allows JPEG, PNG, WebP, and PDF only. Two object policies permit inserts for a matching pending payment and selects for a matching uploaded payment; both require the owning student or a UUID-based teacher role. No object update or delete policy exists. Tests passed for Student A/B read and upload separation, teacher proxy upload and global teacher visibility, missing payment/object rejection, metadata validation, duplicate-path rejection, overwrite denial, confirmation checks, and approval denial before a confirmed upload.
- CONSISTENCY: `submit_payment` allocates the payment row and random immutable object path before upload; `confirm_payment_slip_upload` verifies the stored object and metadata before changing the slip state to `uploaded`. Teachers can mark an uploaded-but-missing object as `missing`; the owner or teacher can then request a fresh retry path/state. Payment approval requires `uploaded` state.
- SIGNED_URL_BOUNDARY: Storage SELECT authorization required by signed-URL creation was behaviorally verified. Actual client `createSignedUrl` integration and expiry selection remain part of frontend implementation.
- CLEANUP: The behavior test ran inside a transaction and rolled back. Storage objects, payments, students, and Auth test users returned to zero rows.
- PRODUCTION_BOUNDARY: Production ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-010 — Frontend implementation baseline

- SOURCE: `src/`, `package.json`, Vitest, TypeScript, Vite production build, and local browser inspection at `127.0.0.1`
- DATE: 2026-08-22
- RESULT: PARTIAL PASS. Vite + TypeScript student and teacher portals implement role-based routing, owned RLS reads, RPC-only protected transitions, credit summaries, booking candidates and decisions, lesson completion, payment submission/review, private slip upload with `upsert: false`, five-minute signed URLs, teacher proxy upload, manual purchase registration, and credit voiding. TypeScript passed; 10/10 unit tests passed; production build passed; unauthenticated login view rendered successfully.
- SAFETY: Runtime environment validation rejects production ref `ploropobmgwlpphtkndo` and any unknown Supabase project. `.env.local` contains only the development URL and publishable key and is Git-ignored. No direct application-table insert, update, or delete path was added.
- VISUAL_CONTINUITY: The rebuilt UI selectively carries forward the old pink/purple palette, serif headings, card treatment, student credit overview, booking, payment, and teacher management layout without copying legacy state generation or fallback code.
- BLOCKER: Google Auth is currently disabled in `suzu2-dev`; authenticated Student A/B and teacher browser flows require an approved development OAuth client configuration.
- PRODUCTION_BOUNDARY: Production Supabase, the old site, commit, and push were not modified.

## E-011 — Hosted development Google Auth configuration

- SOURCE: Google Cloud OAuth client settings and Supabase Auth dashboard on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: CONFIGURED. MFA was enabled for Google Cloud access; the development Supabase callback URL was added to the existing OAuth client; a separate active client secret was added without revoking the existing secret; Google provider is enabled in `suzu2-dev`; and `http://127.0.0.1:4173/` is in the development redirect allow list.
- OLD_SITE_BOUNDARY: The existing `https://suzu-sensei.github.io` JavaScript origin remains present. No old-site file, URL, or existing OAuth secret was removed or replaced.
- SECRET_HANDLING: The new secret was copied through the browser directly into the development Supabase provider configuration and was not written to the repository, local environment files, evidence, or user-facing output.
- AUTH_RESULT: Interactive Google OAuth sign-in completed successfully after correcting the development Client Secret. Auth logs identified and resolved the earlier `invalid_client` exchange failure.
- LIMITATION: Student A/B and complete teacher workflow browser flows remain pending.
- PRODUCTION_BOUNDARY: Production Supabase ref `ploropobmgwlpphtkndo` was not opened or modified.

## E-012 — Development teacher authorization bootstrap

- SOURCE: Supabase SQL Editor on `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. The authenticated project-owner Google identity was inserted into `profiles` and assigned an active `teacher` row in `teacher_roles`; verification returned `teacher / active=true`.
- AUTHORIZATION_MODEL: The frontend resolves teacher access through the Auth user UUID and `teacher_roles`. No fixed-email browser authorization was introduced.
- PRODUCTION_BOUNDARY: Production Supabase, the old site, commit, and push were not modified.

## E-013 — Student onboarding and booking cancellation

- SOURCE: `supabase/migrations/20260822000400_student_onboarding_and_booking_cancellation.sql`, `supabase/tests/003_onboarding_and_cancellation.sql`, frontend teacher/student views, and Supabase SQL Editor on `suzu2-dev`
- DATE: 2026-08-22
- RESULT: PASS. Teacher-only student invitation and claim-code reissue, hash-only token storage, previous-code invalidation, single-use claiming, uncommitted-credit request capacity, 12-hour student cancellation, teacher cancellation, transactional credit return, and audit logging were added. The development behavior test returned `ONBOARDING_CANCELLATION_TEST=PASS` after the final claim-token policy change.
- ISOLATION: Student invitation by a student, reuse of an old/consumed code, Student A cancellation of Student B's booking, cancellation within 12 hours by a student, and excess pending requests were rejected. Test fixtures rolled back.
- FRONTEND: The teacher dashboard now includes student creation, one-time code copy/reissue, explicit confirmation before credit/payment/booking transitions, and cancellation. The student view explains the three-step booking flow and cancellation deadline.
- PRODUCTION_BOUNDARY: Production Supabase, old-site files, commit, and push were not modified.

## E-014 — Payment-slip upload recovery

- SOURCE: `supabase/migrations/20260822000500_payment_slip_retry.sql`, updated `supabase/tests/002_storage_behavior.sql`, and frontend retry controls
- DATE: 2026-08-22
- RESULT: PASS. A browser upload failure leaves the payment row in `missing`, and the owning student or teacher can restart using a new random private object path and updated validated metadata. A potentially successful upload with a lost response is confirmed before being marked failed.
- ISOLATION: Student A could not mark or restart Student B's slip. Retry upload, object metadata confirmation, teacher proxy upload, signed-read separation, overwrite denial, and approval-only-after-upload all passed in `STORAGE_BEHAVIOR_TEST=PASS`.
- PRODUCTION_BOUNDARY: Production Supabase, old-site files, commit, and push were not modified.

## E-015 — Usability, timezone, and security review

- SOURCE: Vite/TypeScript/Vitest build, authenticated local browser inspection, and Supabase Security Advisor on `suzu2-dev`
- DATE: 2026-08-22
- RESULT: PASS WITH EXPECTED ADVISORIES. TypeScript passed; 19/19 unit/render tests passed; production build passed; the authenticated teacher dashboard rendered the onboarding workflow. Booking input and display now use each student's stored IANA timezone, including tested `Asia/Taipei` conversion. OAuth failures show a safe actionable message without exposing provider details.
- SECURITY_ADVISOR: 0 errors and 0 info suggestions. An unintended public grant on the RLS DDL helper was removed, and claim-token client denial is explicit. The remaining 20 warnings identify intended authenticated SECURITY DEFINER RPCs; each has fixed `search_path` and internal ownership or UUID teacher-role checks covered by the behavior tests.
- LIMITATION: A real second-Google-account student browser flow and simultaneous multi-connection race test remain pending before production approval.
- PRODUCTION_BOUNDARY: Production Supabase, old-site files, commit, and push were not modified.

## E-016 — Real Google student workflow and payment-slip E2E

- SOURCE: Authenticated local Vite frontend, Google OAuth, and hosted development Supabase `suzu2-dev` ref `cjypnhxouqxvwwctzojs`
- DATE: 2026-08-22
- RESULT: PASS. A second Google account claimed only its invited student profile, displayed its single owned credit, submitted a booking request, was prevented from overcommitting that credit, received teacher approval, cancelled outside the 12-hour cutoff, and recovered the same credit transactionally.
- STORAGE: The student uploaded a payment proof to the private `payment-slips` bucket and opened it through a time-limited signed URL. The object path followed the immutable `student_id/payment_id/random_uuid.ext` structure. The teacher saw the pending payment and its evidence.
- SAFE_FAILURE: The browser submission was intentionally treated as test data after its mode was observed as `grant_new_credits` with 10 requested lessons. It was not approved. The teacher rejected it with a recorded resubmission reason; the student saw the reason and rejected status; available credit remained exactly 1.
- CREDIT_GUARD: Evidence-only approval with no credit issuance remains covered by the rollback DB behavior test in E-008. No credit was issued by the real mistaken browser submission.
- UX: Teacher rejection and cancellation reasons now use an in-site dialog explaining that the student will see the reason. TypeScript, 19/19 unit/render tests, and the production build passed after the change.
- LIMITATION: Automated browser file-chooser selection did not retain a second non-sensitive fixture, so the already-passed real upload was not duplicated. Simultaneous multi-connection race testing remains pending.
- PRODUCTION_BOUNDARY: Production Supabase, old-site files, commit, and push were not modified.

## E-017 — Development OAuth secret rotation

- SOURCE: Google Cloud OAuth client, Supabase Auth provider settings for `suzu2-dev` ref `cjypnhxouqxvwwctzojs`, and a fresh interactive Google OAuth login
- DATE: 2026-08-22
- RESULT: PASS. The development secret exposed during setup was first disabled and then deleted. A new development secret was created, transferred directly into the `suzu2-dev` Google provider, and accepted by Supabase.
- AUTH_RESULT: A complete logout, Google account selection, OAuth callback, Supabase code exchange, and UUID teacher-role routing succeeded with the replacement secret.
- OLD_SITE_BOUNDARY: Google Cloud permits two active secrets. The pre-existing secret created before the rebuild remains active and unchanged for the old site; only the exposed development secret was removed and replaced. The existing old-site JavaScript origin also remains unchanged.
- SECRET_HANDLING: The replacement secret was held only in transient browser automation memory for direct provider configuration, was not written to project files or evidence, and was cleared from automation memory after verification.
- PRODUCTION_BOUNDARY: Production Supabase ref `ploropobmgwlpphtkndo`, old-site files, commit, and push were not modified.

## E-018 — Old-site GitHub Pages archive

- SOURCE: GitHub repos `suzu-sensei/suzu-sensei.github.io` and `suzu-sensei/old`, local old-repo Git inspection, GitHub Pages deployment, and browser verification
- DATE: 2026-08-22
- RESULT: PASS. Public `origin/main` commit `4a87a71` and its existing history were pushed to the new public `old` repo. GitHub Pages deployment completed successfully and `https://suzu-sensei.github.io/old/` rendered the old landing page.
- LINK_CHECK: The archived textbook page and legacy student login page also rendered at their `/old/` paths with relative assets and navigation intact.
- DIRTY_WORKTREE_BOUNDARY: Modified local old-site classroom files, untracked governance/draft folders, `.claude`, credential-related material, and other uncommitted files were not included. The original local old-site worktree remains unchanged.
- RELEASE_BOUNDARY: The current root site has not been replaced. Root activation is held until the separate production Supabase migration is approved and verified.
- PRODUCTION_BOUNDARY: Production Supabase ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-019 — Returned-credit reuse and simultaneous approval

- SOURCE: `supabase/migrations/20260822000800_reuse_credit_after_cancellation.sql`, updated `supabase/tests/003_onboarding_and_cancellation.sql`, two authenticated teacher browser tabs, and Supabase SQL Editor on `suzu2-dev`
- DATE: 2026-08-22
- REGRESSION_FOUND: A cancelled booking retained the original unconditional unique constraint on `lesson_credit_id`, so the correctly returned `available` credit could not be reserved again.
- FIX: The cancelled booking remains as history. A partial unique index now allows only one `reserved` or `completed` booking per credit and excludes cancelled history, permitting safe reuse after transactional credit return.
- RESULT: PASS. The updated rollback test returned `ONBOARDING_CANCELLATION_TEST=PASS`. A real returned credit was then approved for a later booking successfully.
- RACE_RESULT: PASS. Two teacher tabs approved the same fresh request concurrently. Both client actions completed without creating duplicates; direct database verification returned `reserved_bookings=1`, `distinct_credits=1`, and `reserved_credits=1`.
- CLEANUP: The test booking was cancelled through the teacher RPC. Direct database verification returned `reserved_bookings=0`, `pending_requests=0`, and `available_credits=1`.
- UX: The reason dialog now labels booking rejection, booking cancellation, and payment rejection separately so the teacher can see exactly which action will be recorded.
- PRODUCTION_BOUNDARY: The migration and all state-changing tests targeted only development ref `cjypnhxouqxvwwctzojs`. Production ref `ploropobmgwlpphtkndo` was not opened, linked, or modified.

## E-020 — Final development review

- SOURCE: Vitest, TypeScript, Vite builds, Git diff validation, repository secret scan, E-006 through E-019, and the development database cleanup query
- DATE: 2026-08-22
- RESULT: PASS. Unit/render/environment tests passed 22/22; the normal development-target build and an isolated production-target build-only check both passed; `git diff --check` passed; and no OAuth client secret or Supabase secret-key pattern was found in tracked project content.
- MANDATORY_COVERAGE: Student A/B isolation, double booking approval, credit double use, booking overlap, double lesson completion, repeated payment approval, evidence-only approval, private Storage ownership, signed viewing, and teacher proxy upload are covered by rollback SQL tests and real browser flows.
- RELEASE_BOUNDARY: The new site is pushed only to non-deployed branch `codex/classroom-ready`. Root activation remains blocked on explicit production migration approval and successful production verification.
- PRODUCTION_BOUNDARY: No production database connection or state change was made during final review.

## E-021 — Production migration and opening balance

- SOURCE: Supabase SQL Editor on production ref `ploropobmgwlpphtkndo`, migrations `20260821000100` through `20260822000900`, and `supabase/tests/004_production_migration_verification.sql`
- DATE: 2026-08-22
- AUTHORIZATION: The project owner explicitly approved production migration and selected opening-balance option 1.
- PRECONDITION: Production contained four legacy students, 27 aggregate unused lessons, three matching student Auth identities, one non-student Auth identity for teacher bootstrap, and no objects in the existing private payment-slip bucket. No new runtime tables or RPCs existed before migration.
- RESULT: PASS. Schema, RLS, transactional RPCs, private Storage, onboarding, cancellation, payment retry, explicit claim-token denial, and returned-credit reuse migrations completed successfully.
- DATA_BRIDGE: Four students were copied into the new UUID ownership model. The current 27 unused lessons were converted once into auditable manual opening-balance purchases and 27 `available` credit rows. Three students retained existing Auth UUID ownership; one remains unclaimed. One active UUID teacher role was installed.
- ARCHIVE_BOUNDARY: Legacy lesson history, payment, change-request, override, reminder, quiz, and student tables were not deleted or rewritten. They remain preserved as the old-site archive and are not runtime sources for the new site.
- STORAGE: The bucket is private with a 10 MiB limit and JPEG/PNG/WebP/PDF allow-list. Legacy email/folder and fixed-teacher-email policies were removed; only the new UUID student-ownership/teacher-role policies remain.
- AUTH: Production Google provider is enabled. Site URL and redirect allow-list were set to `https://suzu-sensei.github.io/` without changing the Google OAuth client or secret.
- VERIFICATION: Read-only verification returned `PRODUCTION_MIGRATION_VERIFICATION=PASS` for required tables, RLS, RPCs, student/Auth mapping, 27-credit balance, teacher role, Storage policy removal, and bucket configuration.
- ADVISOR: Production Security Advisor reported one error on the preserved legacy `public.public_leaderboard` SECURITY DEFINER view. It is unrelated to the new classroom schema and was left unchanged to preserve old-site behavior; new classroom tables produced no error-level finding.

## E-022 — Production deployment and authenticated smoke test

- SOURCE: GitHub Actions/Pages, public root and `/old/` browser checks, Google Cloud OAuth client, production Supabase Auth, and authenticated teacher/student browser sessions
- DATE: 2026-08-22
- DEPLOYMENT: PASS. GitHub Pages was switched to GitHub Actions and production public Supabase variables were configured. The first workflow run exposed that the test step did not receive those variables; the workflow was corrected, local production-target tests passed 22/22, and the next deployment completed successfully.
- URLS: The new portal renders at `https://suzu-sensei.github.io/`. The read-only archived site continues to render at `https://suzu-sensei.github.io/old/`.
- OAUTH: PASS. The production Supabase callback URL was added alongside the existing development callback. The known-good secret was copied directly from the development Supabase provider to the production provider without reading, displaying, or persisting it. Existing Google client identity, old-site origin, and other secret were preserved.
- TEACHER_SMOKE: PASS. UUID teacher-role routing loaded the production teacher dashboard, showing four migrated students, 27 total available credits, zero pending bookings, zero pending payments, and zero reserved lessons.
- STUDENT_SMOKE: PASS. The linked test student loaded the student portal with eight owned available credits, zero reserved/completed credits, and no booking, payment, or lesson-history records. No other student profile or balance was displayed.
- WRITE_BOUNDARY: Both production sessions were read-only smoke tests. No student, booking, payment, credit, lesson, or Storage mutation was performed. The browser was logged out afterward.
- KNOWN_LEGACY_FINDING: The preserved legacy `public.public_leaderboard` Security Advisor error remains unchanged and is outside the new classroom runtime.

## E-023 — Public home restoration and classroom path verification

- SOURCE: Reviewed old public commit `4a87a71`, Vite/Vitest/TypeScript, local assembled Pages artifact, production Supabase Auth URL configuration, GitHub Actions run 4, and public browser checks
- DATE: 2026-08-22
- AUTHORIZATION: The project owner approved restoring the original public home and moving only the role-aware student/teacher portal to the canonical `/classroom/` URL.
- SAFE_SOURCE: Public assets were exported from the committed old-site snapshot, not the dirty old worktree. Uncommitted old-site files, governance drafts, credential material, archives, PDFs, and spreadsheets were not copied.
- COLUMN_FIX: PASS. All six existing Column articles are now linked in the home carousel. Desktop arrow navigation reached the final articles; the existing horizontal swipe behavior remains available on mobile.
- LOCAL_RESULT: PASS. Vitest passed 27/27, TypeScript and Vite builds passed, the assembled artifact contained the old home plus `/classroom/`, and both legacy role URLs redirected to the canonical portal.
- AUTH_CONFIGURATION: The production redirect allow list retains the root URL and now also contains `https://suzu-sensei.github.io/classroom/`. Google client identity, callback, origins, and secrets were unchanged.
- DEPLOYMENT: PASS. GitHub Pages workflow run 4 deployed commit `9706f1d` successfully.
- PUBLIC_URLS: PASS. The root rendered `SUZU 先生 · 日本語レッスン`; quiz, JLPT cards, the sixth Column article, and `/classroom/` rendered successfully; six Column cards and the public quiz/classroom links were present.
- LEGACY_REDIRECTS: PASS. `/site/classroom/student.html` and `/site/classroom/teacher.html` both redirected to `/classroom/`.
- AUTH_SMOKE: PASS. Teacher and linked-student Google OAuth returned to `/classroom/`. Teacher-role routing loaded the teacher desk; the student displayed only its own eight available credits and no other-student list. Both checks were read-only and the browser was logged out afterward.

## E-024 — Booking availability, registration-name separation, and student i18n

- SOURCE: Migrations `20260822001000_booking_availability_windows.sql` through `20260822001200_teacher_label_management.sql`, rollback SQL tests 001/002/003/005, TypeScript, Vitest, Vite build, and authenticated development teacher browser inspection.
- DATE: 2026-08-22
- DEVELOPMENT_RESULT: PASS. All three migrations were applied to `suzu2-dev` ref `cjypnhxouqxvwwctzojs`. The database has zero pending requests/candidates and zero reserved bookings after tests.
- BOOKING: PASS. A request accepts up to five candidate dates and three ranked availability ranges per date. Boundaries and final starts use only `:00`/`:30`; teacher approval selects an exact start inside the submitted window and creates a 50-minute booking in the existing credit-reservation transaction.
- IDENTITY: PASS. Student claim now requires the student's submitted registration name. Teacher-only nicknames were migrated to `student_teacher_labels`; the column was removed from `students`; student RLS returned zero teacher labels while teacher RLS returned the test label.
- FRONTEND: PASS. Student login, claim, dashboard, booking, payment, and history UI render in Japanese, Traditional Chinese, and English. Booking input clearly presents candidate dates and first/second/third range preferences. Payment action is `送信する`. The teacher dashboard is Japanese-only and shows exact-start approval controls, an audited edit control for existing teacher-only nicknames, and collapsed credit correction/refund tooling.
- AUTOMATED_RESULT: TypeScript passed; Vitest passed 32/32; Vite production build passed. SQL returned `RPC_BEHAVIOR_TEST=PASS`, `STORAGE_BEHAVIOR_TEST=PASS`, `ONBOARDING_CANCELLATION_TEST=PASS`, and `BOOKING_WINDOWS_REGISTRATION_TEST=PASS`.
- SECURITY: Required tables have RLS enabled; the teacher-label policy count is 1; all four new candidate constraints exist; all checked RPCs are SECURITY DEFINER with fixed search paths. Student A/B and Storage isolation regressions remain passing.
- DEVELOPMENT_DATA: Through the authenticated teacher UI and audited RPC, the existing test student was set to registration name `林さん（テスト）` and teacher-only nickname `たい時間`. Read-only verification returned zero pending requests and zero reserved bookings.
- PRODUCTION_BOUNDARY: Production ref `ploropobmgwlpphtkndo`, the public site, old-site reference, commit, and push were not changed for this update.

## E-025 — Production database release of the booking/language update

- SOURCE: Explicit owner approval, Supabase SQL Editor on production ref `ploropobmgwlpphtkndo`, migrations `20260822001000` through `20260822001200`, and `supabase/tests/004_production_migration_verification.sql`.
- DATE: 2026-08-22
- AUTHORIZATION: The owner explicitly approved production release, including the three migrations and matching frontend commit/push.
- MIGRATION_RESULT: PASS. All three migrations completed successfully on the exact production project ref; no migration was run against the development project during this release step.
- VERIFICATION_RESULT: PASS. Read-only SQL returned `PRODUCTION_MIGRATION_VERIFICATION=PASS` and confirmed the required tables, RLS, RPC signatures, constraints, private Storage configuration, and migrated ownership/credit invariants.
- DATA_RESULT: Four students, 27 available credits, and four teacher-only labels are present. Pending booking requests, pending candidates, reserved bookings, and pending payments are all zero.
- RPC_SECURITY: All ten checked protected transition/identity RPCs are SECURITY DEFINER functions with fixed empty search paths, including the new exact-start booking approval and audited teacher-label RPC.
- PUBLIC_RELEASE: PASS. Commit `059fbeb` was pushed to `main`; GitHub Pages workflow run 6 completed successfully.
- PUBLIC_ROOT: PASS. The original `SUZU 先生 · 日本語レッスン` home remained at the root. Quiz, JLPT, and all six Column article links remained present; the final `みたい／らしい／っぽい` article loaded successfully.
- CLASSROOM: PASS. `/classroom/` loaded the production student dashboard. Japanese, Traditional Chinese, and English switching worked; all time choices used `:00`/`:30`; five candidate-date sections could be added and a sixth could not.
- PRIVACY: PASS. The authenticated linked student saw only its own eight available credits and did not receive the teacher-only label `たい時間`. Both legacy student/teacher URLs redirected to `/classroom/`.
- WRITE_BOUNDARY: No classroom form was submitted. A post-smoke read-only database query remained at four students, 27 available credits, four teacher-only labels, and zero pending requests/candidates/payments or reserved bookings.

## E-026 — Student resources, inactive access, lesson dates, and recording

- SOURCE: Old-site read-only reference, migration `20260822001300_student_classroom_access.sql`, SQL tests 001/002/003/005/006, TypeScript, Vitest, Vite build, and authenticated development teacher/student browser checks.
- DATE: 2026-08-22
- DATABASE: PASS. The migration is applied only to development ref `cjypnhxouqxvwwctzojs`. `update_student_classroom_settings` is SECURITY DEFINER with a fixed empty search path and an internal UUID teacher-role check.
- AUTHORIZATION: PASS. Students cannot execute the settings transition or directly update `students`; teacher changes append an audit row. Inactive students are rejected by both booking and payment RPCs.
- LINKS: PASS. Only HTTPS `meet.google.com` and `drive.google.com` URLs are accepted by the RPC and rendered by the client. Existing RLS exposes each student only to owned resource links while teachers retain classroom-management reads.
- FRONTEND: PASS. Teacher rows provide Meet, Drive, recording, lesson-list, and edit controls. Student pages provide translated resource, device-recording, and booked/past lesson controls in Japanese, Traditional Chinese, and English.
- RECORDING_BOUNDARY: Recording uses browser display/microphone capture and downloads locally. No Storage or Supabase upload path exists for recording data. The permission dialog was intentionally not opened during automated visual inspection.
- TEST_RESULT: `RPC_BEHAVIOR_TEST=PASS`, `STORAGE_BEHAVIOR_TEST=PASS`, `ONBOARDING_CANCELLATION_TEST=PASS`, `BOOKING_WINDOWS_REGISTRATION_TEST=PASS`, and `STUDENT_CLASSROOM_ACCESS_TEST=PASS`. TypeScript, 36 unit/render tests, Vite production build, and `git diff --check` pass.
- DEVELOPMENT_DATA: Post-test read-only counts are zero pending booking requests, zero reserved bookings, zero pending payments, and zero inactive students. No teacher settings form or student application form was submitted during visual checks.
- PRODUCTION_BOUNDARY: This development evidence predates the separately approved production release recorded as D-016 and E-027.

## E-027 — Production database release of student classroom access

- SOURCE: Explicit owner approval, Supabase SQL Editor on production ref `ploropobmgwlpphtkndo`, migration `20260822001300_student_classroom_access.sql`, and `supabase/tests/004_production_migration_verification.sql`.
- DATE: 2026-08-22
- TARGET_CHECK: PASS. The dashboard identified `suzu-sensei's Project`, branch `main Production`, and exact project ref `ploropobmgwlpphtkndo` before execution.
- PRECONDITION: PASS. `update_student_classroom_settings(uuid,text,text,text)` was absent before migration; production contained four students and one active teacher role.
- MIGRATION_RESULT: PASS. The transaction completed successfully and installed the audited teacher-only classroom-settings RPC with fixed empty search path and authenticated-only execute grant.
- VERIFICATION_RESULT: PASS. Read-only SQL returned `PRODUCTION_MIGRATION_VERIFICATION=PASS` for required tables, RLS, RPC signatures, Auth ownership bridge, 27-credit opening balance, teacher role, and private payment-slip Storage configuration.
- PUBLIC_RELEASE: PASS. Commit `d284f80` was pushed to `main`; GitHub Pages workflow run 8 completed successfully.
- PUBLIC_ROOT: PASS. The original public home remained at the root with Quiz, classroom navigation, and seven Column links including the final `みたい／らしい／っぽい` article.
- STUDENT_SMOKE: PASS. The authenticated linked student saw only its own eight available credits and the new Meet, Drive, browser-local recording, and past/booked lesson controls. Japanese, Chinese, and English selectors remained present.
- WRITE_BOUNDARY: No booking, payment, recording, student-setting, or Storage form was submitted. The production smoke session was logged out after verification.
