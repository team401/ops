# Cloudflare migration plan

## Recommendation

Move Ops toward the same Cloudflare platform used by Scouting, but do it in
phases. Ops currently exports a static Next.js application and talks directly
to Firebase Auth, Firestore, and Firebase Storage. Scouting is a server-backed
Vinext/Workers application using D1, so copying its deployment configuration is
not a hosting-only change.

The target architecture is:

- Cloudflare Pages for the current static frontend, then Workers if server APIs
  become necessary.
- R2 for task attachments.
- D1 for tasks, users, calendar events, certifications, inventory, device
  sessions, and timeclock data.
- Firebase Auth temporarily, with tokens verified by the Worker API. Replace
  authentication only after the data and storage migrations are stable.

Production and staging should use the same D1 database and R2 bucket, matching
the current shared-data requirement. Only their frontend deployments differ.

## Why this order

### 1. Move the static frontend to Cloudflare Pages

This is low risk because `next.config.ts` already uses `output: "export"`.
Cloudflare Pages can build with `npm run build` and publish `out` without a
Next.js adapter. Configure `main` as production and use branch preview builds
for staging and feature PRs.

This improves deployment consolidation and previews, but does not materially
reduce Firebase spending because GitHub Pages is already free and the browser
will still call Firebase directly.

Cloudflare documentation:
https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

The Pages project uses Cloudflare's GitHub integration. It builds `main` as
production and provides branch/PR preview deployments automatically. Verify the
`main`, `staging`, and feature-branch `pages.dev` deployments. The production
domain `ops.team401.org` was cut over after validation, and the obsolete GitHub
Pages deployment workflow was removed.

The Cloudflare build intentionally omits `NEXT_PUBLIC_BASE_PATH`: every Pages
branch is served at the root of its own branch hostname rather than under the
GitHub Pages `/staging` path.

Git integration documentation:
https://developers.cloudflare.com/pages/configuration/git-integration/

### 2. Move attachments to R2

This is the simplest meaningful Firebase cost reduction. Add a small Worker API
that verifies the signed-in user's Firebase ID token, authorizes the requested
task operation, and issues or handles R2 uploads and downloads. New files can be
written to R2 while existing Firebase Storage URLs continue to work. A one-time
migration can copy old objects and update task attachment records.

R2 includes 10 GB-month of Standard storage, one million Class A operations,
ten million Class B operations, and free egress each month on its free tier.

Cloudflare documentation:
https://developers.cloudflare.com/r2/pricing/

### 3. Put a Worker API in front of application data

Do not let the browser connect directly to D1. Add authenticated Worker routes
for each domain and initially keep Firestore as the backing store. This creates
a stable API boundary and allows one collection at a time to move without a
single high-risk rewrite.

Suggested migration order:

1. inventory and certifications;
2. calendar events;
3. device sessions and timeclock data;
4. tasks, comments, prerequisites, ordering, and archive state;
5. user profiles and role administration.

### 4. Move Firestore data to D1

D1's free tier currently includes five million rows read per day, 100,000 rows
written per day, and 5 GB of storage. Add indexes for status, subteam, assignee,
archive state, and update time so board refreshes do not scan whole tables.

Firestore snapshot listeners currently provide live updates. Preserve that user
experience with short conditional polling first. Durable Objects or server-sent
events can be evaluated later if polling is not responsive enough. The Worker
free tier currently allows 100,000 requests per day, so polling frequency must
be measured rather than guessed.

Cloudflare documentation:
https://developers.cloudflare.com/d1/platform/pricing/
https://developers.cloudflare.com/workers/platform/limits/

### 5. Re-evaluate authentication last

Firebase email/password authentication is free below 50,000 monthly active
users and is not currently a meaningful cost. Keeping it during migration also
avoids forcing password resets and reduces security risk. Once all application
data is behind Workers, Ops can either continue using Firebase solely as the
identity provider or adopt the same session/account system as Scouting in a
separate migration.

Firebase pricing:
https://firebase.google.com/pricing

## Caching policy

- Tasks remain in Firestore's default in-memory cache and continue using live
  snapshot listeners. Do not enable persistent browser caching globally: team
  Chromebooks are shared, Firestore's web cache survives sessions, and cached
  leaders-only tasks could remain on a device after sign-out.
- New task attachments use a one-year immutable cache header. Their storage
  paths include a UUID, so modified files receive new paths and cannot collide
  with stale cached bytes.
- Existing Firebase Storage objects keep their current metadata until a
  migration updates it or copies them to R2.

Firebase explicitly recommends treating persistent web caches carefully on
devices that may not be trusted:
https://firebase.google.com/docs/firestore/manage-data/enable-offline

## Cutover rules

- Export and back up Firebase data before every migration phase.
- Dual-read or dual-write only for a short, measured transition window.
- Verify record counts and attachment hashes before deleting Firebase data.
- Keep a rollback flag for every migrated domain.
- Do not remove Firebase billing or buckets until production has completed at
  least one full operating cycle on Cloudflare.
