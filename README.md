# 401 Ops

Team 401's operations hub for managing projects, assignments, certifications, attendance, inventory, and reporting. It is built as a static Next.js application and uses Firebase Authentication, Cloud Firestore, and Firebase Storage for its backend.

## What the app does

- Kanban boards for the full team and individual subteams
- Searchable drivetrain inventory for gears, pulleys, sprockets, and belts
- Certification-aware task assignment and self-assignment
- Task priorities, due dates, points of contact, comments, and file attachments
- Stuck-task reasons and prerequisite task relationships
- Calendar and embedded Gantt views for due dates and dependencies
- Student and coach certification management
- Metrics for task throughput, workload, and subteam activity
- Individual reports containing task history, certifications, and attendance hours
- CSV exports for team summaries, task history, and attendance
- Coach-managed timeclock with shop and outreach sessions
- Full-screen kiosk mode using automatically assigned 1–3 digit PINs
- Coach tools for signing out one person or everyone who forgot to clock out
- Coach roster administration, individual account creation, CSV batch imports, and prepared credential emails

## Roles and permissions

| Role | Access |
| --- | --- |
| Coach | Manages all tasks, accounts, PINs, certifications, reports, metrics, and timeclock sessions. Coaches can also launch kiosk mode. |
| Student leader | Manages tasks and student certifications for their own subteam. Their reports are limited to their own information. |
| Student | Can view boards, join eligible tasks, update assigned tasks, add comments or attachments, and view their own certifications and report. |

The interface hides unavailable actions, but the actual authorization boundary is enforced by `firestore.rules` and `storage.rules`.

## Hardware inventory

The authenticated `/inventory` page tracks quantities, bin locations, sourcing
details, and category-specific specifications. It includes the team's standard
20 DP gears, 3mm GT2 and 5mm HTD belts/pulleys, #25 and #35 sprockets, 9mm and
15mm widths, single/double-sided belts, and common robot bore standards.
Suggested specifications remain free-text entries, so newly acquired bore,
profile, width, and chain options automatically become searchable filter
choices without a schema change. Any signed-in team member can add hardware,
edit records, and adjust stock; only coaches can permanently delete records.

## Parts dashboard integration

Parts exports and manufacturing tracking now live in the separate
[Team 401 Parts dashboard](https://team401.org/export/). The **Parts** link in
the header opens that dashboard in a new tab.

The two sites use separate Firebase projects. Ops uses `team-401`; the Parts
dashboard remains on `robotics-kanban`. This repository's `firestore.rules` and
`storage.rules` protect only Ops data and task attachments and must be deployed
only to `team-401`:

```bash
firebase deploy --only auth,firestore:rules,storage
```

Do not deploy these rules to `robotics-kanban`, because that project retains the
manufacturing dashboard's exporter, OAuth, and file-access rules.

## Technology

- Next.js 16 with the App Router and static export
- React 19 and TypeScript
- Tailwind CSS 4
- Firebase Authentication, Cloud Firestore, and Firebase Storage
- dnd-kit for board interactions
- Recharts for metrics
- date-fns for scheduling and reports

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

Create a Firebase project and web app, then enable:

- Authentication with the Email/Password provider
- Cloud Firestore
- Firebase Storage

Create `.env.local` in the project root using the Firebase web configuration:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

These values identify the Firebase web app and are safe to include in a client build. Firebase security rules, not secrecy of these values, protect application data.

### 3. Deploy the Firebase configuration

Install and authenticate the Firebase CLI if needed, then select the correct Firebase project and deploy Email/Password Authentication plus both rule files:

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only auth,firestore:rules,storage
```

Task attachments are limited to 20 MB per file by the Storage rules.

### 4. Create the first coach

There is deliberately no public account-registration page. The first coach must be bootstrapped from the Firebase console:

1. In **Authentication → Users**, create an email/password user.
2. Copy the new user's UID.
3. In Firestore, create `users/{uid}` with the following fields:

```json
{
  "uid": "the-authentication-uid",
  "displayName": "Coach Name",
  "email": "coach@example.com",
  "role": "coach",
  "subteam": null,
  "certificationIds": [],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "mustResetPassword": false
}
```

After signing in, that coach can create the remaining accounts from **Admin → Roster**. New accounts receive a temporary password and an available timeclock PIN automatically.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Type-check and generate the static site in `out/` |
| `npm run start` | Start Next.js in server mode; the deployed app normally uses the static export instead |

## Firebase data

The app currently uses these top-level collections:

- `users` — profiles, roles, subteams, and certifications
- `tasks` — task details, assignment history, comments, attachments, and dependencies
- `certifications` — coach-managed certification definitions
- `inventory` — mechanical hardware specifications, locations, and live stock counts
- `subteams` — optional coach-managed subteam reference data
- `timeclockPins` — coach-only kiosk PIN records kept separate from public profiles
- `timeEntries` — shop and outreach attendance sessions

Uploaded task files are stored under `task-attachments/{taskId}/...` in Firebase Storage.

## Timeclock and kiosk security

Only a coach can launch the kiosk. Kiosk PINs identify which team member is clocking in or out; they are not Firebase passwords and cannot be used to sign into the main application.

The kiosk runs inside the authenticated coach session, so exiting kiosk mode requires the current coach's password. While kiosk mode is active, a root-level guard blocks other app routes and replaces Back/Forward navigation with the locked timeclock. A safe-sign-out option is also available and returns the device to the login screen. Firestore rules restrict all time-entry writes and PIN reads to coaches.

## Deploying to GitHub Pages

The project is configured for static export and includes `.github/workflows/deploy.yml`. Pushes to `main` build and deploy the `out/` directory.

Add each `NEXT_PUBLIC_FIREBASE_*` value listed above as a GitHub Actions repository secret, then configure **Settings → Pages** to use **GitHub Actions** as the deployment source.

The GitHub Pages base path is derived from the repository name in `next.config.ts`:

```ts
const repoName = "ops";
```

With the repository named `ops`, the project site is published at
`https://team401.github.io/ops/` or at `/ops/` beneath the team's configured
custom domain. Update this value if the repository is renamed again.

## Operational notes

- Removing someone from the Admin roster deletes their Firestore profile but not their Firebase Authentication record. Delete the Authentication user from the Firebase console when access must be fully revoked.
- Changes to `firestore.rules` or `storage.rules` are not applied by the GitHub Pages deployment. Deploy Firebase rules separately.
- Provisioning and using Firebase Storage requires the Firebase project to use the Blaze plan, even when usage remains within no-cost quotas.
- Unknown routes redirect to the app home page, which then sends authenticated users to the board and signed-out users to login.
