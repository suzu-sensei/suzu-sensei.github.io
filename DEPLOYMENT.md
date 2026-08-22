# Deployment

The public marketing site, games, textbook, and columns use `https://suzu-sensei.github.io/`. The role-aware classroom uses the canonical URL `https://suzu-sensei.github.io/classroom/`.

## GitHub Pages variables

Configure these repository variables immediately before the first production deployment:

- `VITE_SUPABASE_URL`: the approved production project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the approved production publishable key.

The workflow sets `VITE_DEPLOY_ENV=production`. The application build fails closed unless the URL contains the approved production ref. Development builds default to `development` and accept only `suzu2-dev`.

## Release order

1. Apply the reviewed migrations to production only after explicit approval.
2. Run production structural, RLS, RPC, Storage, and security checks.
3. Configure production Google OAuth and allow both the root and `/classroom/` redirect URLs.
4. Configure the two GitHub Pages repository variables.
5. Enable GitHub Actions as the Pages source and run the deployment workflow.
6. Verify teacher and student login, ownership isolation, booking, payment evidence, and signed URLs.
7. Keep the pre-restoration snapshot available at `https://suzu-sensei.github.io/old/` as a rollback reference.

The Pages artifact is assembled from the reviewed old public-site commit plus the Vite classroom build. Only the old student and teacher URLs are replaced with redirects to `/classroom/`; unpublished old-site work and credential files are not copied.

Never place OAuth secrets, database passwords, service-role keys, or student data in GitHub variables used by the frontend.
