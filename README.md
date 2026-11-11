# 401 Ops

Team 401's operations hub for projects, assignments, certifications, attendance, and reporting.

## Features

- Full-team and subteam Kanban boards
- Certification-aware task assignment
- Task comments, links, prerequisites, images, and file attachments
- Recurring calendar events and task deadlines
- Coach-managed attendance and kiosk timeclock
- Student reports, team metrics, and CSV exports
- Coach roster, account, PIN, and certification administration

The Parts, Scouting, and Battery links open Team 401's separate external apps.

## Architecture

- Next.js 16 static export, React 19, TypeScript, and Tailwind CSS 4
- Cloudflare Pages for production, staging, and feature previews
- Cloudflare Worker API for authorization and data access
- Cloudflare D1 for users, tasks, certifications, calendar, and attendance data
- Cloudflare R2 for task attachments
- Firebase Authentication for email/password identity only

The Worker verifies Firebase ID tokens, then authorizes requests using the user's D1 profile. Firestore and Firebase Storage are not runtime dependencies.

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=team-401.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=team-401
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_OPS_API_URL=https://api.ops.team401.org
```

Firebase web configuration identifies the Auth application and is intentionally available to the browser. Application authorization is enforced by the Worker API.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Type-check and generate the static site in `out/` |
| `npm run worker:check` | Type-check the Cloudflare Worker |
| `npm run worker:deploy` | Deploy the Cloudflare Worker API |
| `npm run d1:migrate` | Apply pending D1 schema migrations |

## Accounts

There is no public registration page. Firebase Authentication stores account credentials, while the matching profile and permissions live in D1. Coaches create additional accounts from **Admin → Roster**; each new account receives a temporary password and a timeclock PIN.

Removing a roster profile immediately removes application access but does not delete the corresponding Firebase Authentication identity. Delete the Auth user from the Firebase console when the login itself must be permanently removed.

## Deployment flow

- Feature branches open pull requests into `staging` and receive Cloudflare preview deployments.
- `staging` publishes to `https://staging.ops.team401.org`.
- A manually reviewed `staging` → `main` pull request promotes the tested UI.
- `main` publishes to `https://ops.team401.org`.
- Production and staging intentionally share the same D1 database, R2 bucket, and Firebase Auth project.

Cloudflare Pages builds with `npm run build` and publishes `out`. Configure the Firebase Auth variables above plus `NEXT_PUBLIC_OPS_API_URL` in both production and preview environments.

`workers/api/wrangler.jsonc` defines the `team401-ops-api` Worker, shared D1 database, R2 bucket, allowed browser origins, and `api.ops.team401.org` custom domain.

Password reset and QR device sign-in use the same Firebase project as normal login. The Worker requires these secrets:

```text
FIREBASE_WEB_API_KEY
FIREBASE_SERVICE_ACCOUNT_EMAIL
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
```

The web API key is the same public Firebase key used by `NEXT_PUBLIC_FIREBASE_API_KEY`. The service-account email and PKCS#8 private key come from a Firebase Admin service-account JSON key and must only be stored as Cloudflare Worker secrets. Apply D1 migrations before deploying the Worker. In Firebase Authentication → Templates → Password reset, set the custom action URL to `https://ops.team401.org/login` so reset links finish inside Ops.

Renovate targets `staging`. Routine non-major updates may auto-merge only after validation succeeds. Promotion to `main` remains manual.

## Kiosk security

Only coaches can launch kiosk mode. Kiosk PINs identify team members for attendance and are not Firebase passwords. A global guard prevents navigation away from the locked timeclock; exiting requires the signed-in coach's password or safe sign-out.
