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

- vinext on Vite, React 19, TypeScript, and Tailwind CSS 4
- Cloudflare Workers with prerendered static assets for production, staging, and feature previews
- Shared Team 401 components and design tokens from `@team401/web-ui`
- Cloudflare Worker API for authorization and data access
- Cloudflare D1 for users, tasks, certifications, calendar, and attendance data
- Cloudflare R2 for task attachments
- Team 401 Auth for identity and D1-backed Ops sessions

The current frontend uses an Ops session cookie. The API retains Firebase token verification for older deployed frontends during rollout.

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_OPS_API_URL=https://api.ops.team401.org
```

Application authorization is enforced by the Worker API.

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
| `npm run build` | Build the vinext Cloudflare Worker and prerendered assets |
| `npm run deploy:vinext` | Build and deploy the Ops frontend Worker |
| `npm run worker:check` | Type-check the Cloudflare Worker |
| `npm run worker:deploy` | Deploy the Cloudflare Worker API |
| `npm run d1:migrate` | Apply pending D1 schema migrations |

## Accounts

Team 401 Auth owns account credentials. Ops authorizes requests against the existing D1 profile linked by the central account's Ops user ID. New accounts need that mapping and a corresponding Ops profile before they can sign in. The Ops roster manages existing profiles, certifications, and timeclock PINs.

## Deployment flow

- Feature branches open pull requests into `staging` and receive Cloudflare Worker preview deployments.
- `staging` publishes to `https://staging.ops.team401.org`.
- A manually reviewed `staging` → `main` pull request promotes the tested UI.
- `main` publishes to `https://ops.team401.org`.
- Production and staging share the Ops D1 database and R2 bucket. Central sign-in uses the corresponding Team 401 Auth environment.

The vinext build mirrors static assets to `out/` for Pages previews. Configure `NEXT_PUBLIC_OPS_API_URL` for production and staging. Test authenticated flows on the stable custom domains, where the browser can send the session cookie to the same-site API.

`workers/api/wrangler.jsonc` defines the `team401-ops-api` Worker, shared D1 database, R2 bucket, allowed browser origins, and `api.ops.team401.org` custom domain.

Apply migration `0009_team401_auth.sql` and deploy the API before publishing the frontend. The API rollout supports existing clients while new clients start using central sign-in, QR device links, and central password reset. Retain existing Firebase API configuration until the old clients are retired.

Renovate targets `staging`. Routine non-major updates may auto-merge only after validation succeeds. Promotion to `main` remains manual.

## Kiosk security

Only coaches can launch kiosk mode. Kiosk PINs identify team members for attendance. A global guard prevents navigation away from the locked timeclock. Exiting signs the coach out and returns the browser to sign-in.
