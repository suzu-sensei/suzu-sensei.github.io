# Current Status

MODE: DOCUMENT
STATUS: DEVELOPMENT_FEATURE_COMPLETE_STUDENT_E2E_PASSED
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
- The currently published old-site snapshot is preserved and verified at `https://suzu-sensei.github.io/old/`; local uncommitted old-site work and credential-related files were excluded.
- GitHub Pages root hosting is approved. The production workflow is prepared to fail closed unless its explicit production target matches ref `ploropobmgwlpphtkndo`.
- Docker Desktop has been stopped and local Supabase will not be used.
- Next stage: run the remaining multi-connection race checks and final review, then request the separate production Supabase migration approval before activating the root site. Production remains untouched.
