# Deployment

The public classroom will use `https://suzu-sensei.github.io/` only after the separate production Supabase migration is approved and verified.

## GitHub Pages variables

Configure these repository variables immediately before the first production deployment:

- `VITE_SUPABASE_URL`: the approved production project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the approved production publishable key.

The workflow sets `VITE_DEPLOY_ENV=production`. The application build fails closed unless the URL contains the approved production ref. Development builds default to `development` and accept only `suzu2-dev`.

## Release order

1. Apply the reviewed migrations to production only after explicit approval.
2. Run production structural, RLS, RPC, Storage, and security checks.
3. Configure production Google OAuth and the root redirect URL.
4. Configure the two GitHub Pages repository variables.
5. Enable GitHub Actions as the Pages source and run the deployment workflow.
6. Verify teacher and student login, ownership isolation, booking, payment evidence, and signed URLs.
7. Keep the archived previous site available at `https://suzu-sensei.github.io/old/`.

Never place OAuth secrets, database passwords, service-role keys, or student data in GitHub variables used by the frontend.
