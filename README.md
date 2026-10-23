# Vectora

Investment group management for monthly investing challenges in Tanzania. Vectora replaces the
admin's Excel workflow: recording investments (Units / Stock Market), verifying proofs, and
producing the challenge summary report with column totals and a FINAL TOTAL.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict
- Firebase: Auth, Firestore, Cloud Storage, Cloud Functions (v2, Node 22), Emulator Suite
- Tailwind CSS 4, shadcn/ui (Base UI), lucide-react, next-themes, sonner
- react-hook-form + zod 4 (shared schemas for forms and server code)
- next-intl (English / Kiswahili, chosen via cookie)
- Vitest, ESLint 9 (flat config) + Prettier

## Prerequisites

- Node.js 22 or newer (`node -v`)
- Java 21 or newer (required by the Firestore/Storage emulators: `java -version`)
- Firebase CLI: `npm install -g firebase-tools`

## Local setup

```bash
npm install
npm --prefix functions install
cp .env.example .env.local        # emulator defaults, no real credentials needed
npm --prefix functions run build   # compiles Cloud Functions for the emulator

# Terminal 1: Firebase emulators (Auth 9099, Firestore 8080, Storage 9199, Functions 5001, UI 4000)
npm run emulators

# Terminal 2: create the first Super Admin (the only way to bootstrap an account)
npm run seed:admin -- --email you@example.com --password 'ChangeMe123!' --name "Your Name"

# Terminal 2: run the app
npm run dev
```

Open http://localhost:3000 and sign in with the Super Admin you seeded. Add further admins or
viewers from **Settings → Users and roles**. The Emulator UI is at http://127.0.0.1:4000.

`npm run emulators` saves emulator data to `.emulator-data/` when you stop it (Ctrl+C). Use
`npm run emulators:resume` afterwards to start again with that saved data.

## Environment variables

| Variable                                        | Purpose                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`             | `true` to use the local Emulator Suite                                                                  |
| `NEXT_PUBLIC_FIREBASE_*`                        | Web app config from Firebase console → Project settings                                                 |
| `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST`            | Emulator host, default `127.0.0.1`                                                                      |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account for the Admin SDK in production (not needed on Google Cloud runtimes or with emulators) |
| `SESSION_EXPIRES_DAYS`                          | Session cookie lifetime, 1–14 days (default 5)                                                          |

`.env.local` is git-ignored. Never commit service account keys.

## Authentication and roles

Roles: `super_admin` (everything, manages users), `admin` (manages data), `viewer` (read-only reports).

- The role lives in a Firebase **custom claim** and is mirrored to `users/{uid}` for display.
  Only server code (Admin SDK) writes either; Firestore rules deny all client writes to `users`.
- Sign-in: the browser signs in with Firebase Auth, then exchanges a fresh ID token at
  `POST /api/auth/session` for an httpOnly `__session` cookie. Accounts without a role are rejected.
- `src/proxy.ts` redirects requests without a session cookie to `/login` (optimistic check).
- `src/lib/auth/dal.ts` verifies the cookie (including revocation) on every page, server action and
  route handler: `requireUser()`, `requireRole()`, `assertRole()`.
- Changing a user's role or disabling them revokes their tokens, so the change applies immediately.
- Every user change writes an entry to `auditLogs`.

## Scripts

| Command                                                 | Description                                   |
| ------------------------------------------------------- | --------------------------------------------- |
| `npm run dev`                                           | Next.js dev server                            |
| `npm run build` / `npm start`                           | Production build / serve                      |
| `npm run lint`                                          | ESLint                                        |
| `npm run typecheck`                                     | TypeScript (`tsc --noEmit`)                   |
| `npm test`                                              | Vitest unit tests                             |
| `npm run format`                                        | Prettier                                      |
| `npm run emulators`                                     | Firebase Emulator Suite with data persistence |
| `npm run seed:admin -- --email … --password … --name …` | Create or promote a Super Admin               |

## Project structure

```
src/
  app/                 routes: /login, (app)/dashboard, challenges, transactions, investors,
                       reports, import, settings; api/auth/session
  components/          ui/ (shadcn), layout/ (shell, nav, theme & language switchers), providers/
  features/            auth/, users/ (+ investors, challenges, transactions, reports, import)
  i18n/                next-intl request config and locale action
  lib/                 firebase/ (client + admin), auth/ (DAL, roles), validators/, money.ts, audit.ts
  types/               shared domain types
  proxy.ts             route protection
functions/             Cloud Functions (aggregates arrive in Milestone 6)
messages/              en.json, sw.json
scripts/               seed scripts
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
```

## Data model

| Path                                          | Contents                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                                 | name, email, role, disabled, createdAt, updatedAt                                                                                                                            |
| `investors/{investorId}`                      | name, nameLower, phone, notes, status, portalUid (future portal), timestamps                                                                                                 |
| `challenges/{challengeId}`                    | title, month, year, startDate, endDate, status, totals { units, stock, final, participants }                                                                                 |
| `challenges/{id}/investorTotals/{investorId}` | units, stock, total (maintained by Cloud Functions)                                                                                                                          |
| `transactions/{txId}`                         | challengeId, investorId, investorName, type, amount, date, institution, reference, proofUrl, proofPath, rawMessage, notes, status, source, createdBy, verifiedBy, timestamps |
| `auditLogs/{logId}`                           | entity, entityId, action, before, after, userId, timestamp                                                                                                                   |

All money is stored as whole TZS integers. `src/lib/money.ts` rejects decimals rather than rounding.

## Deployment

A full deployment guide (Firebase App Hosting or Vercel, rules/indexes/functions deploy) is part of
Milestone 9.
