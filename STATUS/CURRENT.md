# Current Status

MODE: DOCUMENT
STATUS: PUBLIC_HOME_AND_CLASSROOM_VERIFIED
LAST_UPDATED: 2026-08-22
OWNER: Project owner (user)

- Target repository confirmed.
- Requirements recorded as the source of truth.
- Old site remains read-only.
- Read-only implementation readiness gate passed for the design phase only.
- Vite + TypeScript, UUID `teacher_roles`, hosted development Supabase, and visual continuity are approved.
- Development project `suzu2-dev` (`cjypnhxouqxvwwctzojs`) is the only authorized hosted target.
- Initial schema migration has been applied and structurally verified in the development project.
- RLS migration has been applied and structurally verified in the development project.
- Required transactional RPC migration has been applied and verified in the development project.
- Private payment-slip Storage migration has been applied and behaviorally verified in the development project.
- Student and teacher frontend implementation is built and passes TypeScript, unit-test, production-build, and unauthenticated visual checks.
- Development Google Auth is enabled using a dedicated additional secret on the existing OAuth client; the existing secret and old-site JavaScript origin remain unchanged.
- The development OAuth secret exposed during setup has been disabled and deleted, replaced in `suzu2-dev`, and verified with a fresh interactive teacher Google login. The pre-existing old-site secret remains active and unchanged.
- Interactive Google OAuth login succeeded in the development project, and the project owner account has an active UUID-based `teacher_roles` row.
- Teacher onboarding now creates unclaimed student profiles and one-time 72-hour claim codes without storing plaintext codes.
- Student and teacher booking cancellation is transactional; student self-cancellation closes 12 hours before the lesson and safely returns the reserved credit.
- Booking request capacity is enforced against uncommitted available credits in the database.
- Failed payment-slip uploads are recoverable with a fresh private path and remain isolated by student ownership/teacher role.
- Student profile timezones are now used for booking input and display to prevent cross-country time shifts.
- Security Advisor reports 0 errors and 0 info suggestions; the remaining 20 warnings are the expected authenticated SECURITY DEFINER RPC entry points with internal authorization checks.
- Real Google-account student E2E passed for profile claim, owned-credit display, booking submission, teacher approval, student cancellation, transactional credit return, private slip upload, signed-URL viewing, rejection-reason display, and no accidental credit issuance.
- Teacher rejection reasons now use an accessible in-site dialog that tells teachers the reason will be shown to the student; browser-native prompt input was removed.
- A cancelled booking no longer blocks reuse of its transactionally returned credit. The active-credit uniqueness guard now applies only to `reserved` and `completed` bookings, while cancelled booking history is retained.
- Real two-tab simultaneous approval passed: both requests completed safely, with exactly one reserved booking, one distinct credit, and one reserved credit in the database. Test data was cancelled afterward, returning development state to zero active/pending bookings and one available test credit.
- Teacher reason dialogs now distinguish booking rejection, booking cancellation, and payment rejection with explicit action-specific wording.
- The currently published old-site snapshot is preserved and verified at `https://suzu-sensei.github.io/old/`; local uncommitted old-site work and credential-related files were excluded.
- GitHub Pages root hosting is approved. The production workflow is prepared to fail closed unless its explicit production target matches ref `ploropobmgwlpphtkndo`.
- Docker Desktop has been stopped and local Supabase will not be used.
- Production migration was explicitly approved with opening-balance option 1. All new schema, RLS, RPC, private Storage, onboarding, cancellation, retry, and credit-reuse migrations are installed on production ref `ploropobmgwlpphtkndo`.
- Four legacy student profiles and 27 unused lessons were converted into the new ledger as auditable opening-balance purchases and available credits. Three profiles are linked to existing Auth UUIDs; one remains unclaimed. All legacy tables and records remain untouched.
- Production verification returned `PRODUCTION_MIGRATION_VERIFICATION=PASS`. Google Auth is enabled; Site URL and redirect allow-list now contain `https://suzu-sensei.github.io/`.
- GitHub Actions production variables are configured with public-only Supabase URL and publishable key, and Pages is configured for GitHub Actions deployment.
- GitHub Pages now serves the new classroom portal at `https://suzu-sensei.github.io/`; the preserved old site remains available at `https://suzu-sensei.github.io/old/`.
- The initial Pages workflow failure was limited to missing production variables in the test step. The workflow was corrected, local production-target tests passed 22/22, and the subsequent production deployment completed successfully.
- The production Supabase callback URL was added to the existing Google OAuth client without removing the development callback, old-site origin, or existing secret. The known-good OAuth secret was transferred from development Supabase to production Supabase without reading or recording it.
- Authenticated production smoke tests passed for both roles. The UUID teacher account saw four students and 27 aggregate available credits with no pending bookings or payments. The linked test student saw only its own eight available credits and no other student records.
- The browser was logged out after verification. No booking, payment, credit, student, or Storage record was created or changed during production smoke testing.
- The project owner superseded the root-only classroom layout. The original public home, games, textbook, and columns are prepared for restoration at the root; the new role-aware classroom is prepared at `/classroom/`.
- All six existing Column articles are now present in the home-page slider. Desktop arrow navigation and mobile horizontal swiping use the existing carousel behavior.
- Legacy student and teacher URLs redirect to `/classroom/`, and production Supabase now allows the canonical classroom OAuth return URL alongside the root URL.
- Local verification passed with 27/27 tests, a successful TypeScript/Vite build, six Column cards, working carousel navigation, visible quiz/classroom links, and both legacy role redirects.
- GitHub Pages workflow run 4 deployed commit `9706f1d` successfully. The public root renders the restored old home; quiz, JLPT cards, all six Column pages, and the `/classroom/` portal are reachable at their intended URLs.
- Both legacy student and teacher bookmark URLs redirect to `/classroom/` in production.
- Authenticated production smoke tests passed at `/classroom/`: UUID teacher routing loaded the teacher desk, and the linked test student saw only its own eight available credits. The browser was logged out afterward and no application data was changed.
- Next stage: normal use and monitoring. The public site and classroom URL layout are complete.
