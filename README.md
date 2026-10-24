# Vectora

Investment group management for monthly challenges in Tanzania. Each signup creates a private group workspace. Group data is stored in Supabase Postgres and isolated with Row Level Security (RLS).

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Supabase Auth, Postgres, RLS, and private Storage
- Tailwind CSS 4, shadcn/ui, TanStack Table, ExcelJS, and PDF reports
- Zod, React Hook Form, Vitest, ESLint, and Prettier

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY` from Supabase Project Settings → API Keys.
3. On a new database, apply migrations `202610230001_initial_multitenant.sql` and then `202610240001_group_admin_invites.sql` in the Supabase Dashboard SQL Editor. If the initial migration is already applied, run only the second migration.
4. In Supabase Authentication settings, enable email/password signups and email confirmations. Set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` under allowed redirect URLs. The callback is used for signup confirmation and admin invitations.
5. Configure Brevo as the custom SMTP provider in Supabase (see below).
6. Run `npm install` and `npm run dev`.
7. Open http://localhost:3000/signup. Enter your name, group name, email, and password. Enter the one-time code from the confirmation email to verify your address and open the new group.

The migrations create the group, membership, profile, investors, challenges, transactions, audit log, admin invitations, and private `proofs` bucket. A database trigger creates a new group and makes the signup user its owner. Normal application reads and writes use the signed-in user's Supabase session; Postgres RLS checks group membership and role. A server-only Supabase secret key is used only to send Auth invitation emails and must never be exposed to the browser.

## Signup and groups

- Signup asks for the person's name, group name, email, and password. Supabase Auth creates the account and sends its confirmation email. The verification screen accepts an OTP when the email template includes `{{ .Token }}` and also supports the default confirmation link.
- On account creation, a database trigger creates the profile, a brand-new group, and an `owner` membership atomically. The group name is provided on the signup form; users do not join an existing group during signup.
- The signup screen verifies the emailed code with Supabase Auth and establishes the session. Sign-in only authenticates an existing account; it does not make another group. The app loads that user's group membership and uses its group ID for all workspace data.
- The creator is shown as **Super Admin** (database role `owner`). The Super Admin can send up to two email-bound Admin invitations from Settings. Supabase emails the invite link. Invitees use that link to set their name and password; admins can manage group data but only the Super Admin can manage invites or reopen closed challenges. Viewers have read-only access to reports and the dashboard.
- Every tenant-owned row includes `group_id`. RLS policies and composite foreign keys prevent access across groups, including in direct API calls.
- Storage paths begin with the group UUID. The `proofs` bucket is private and Storage policies apply the same group membership checks.
- Investor entries are records inside a group. They are not separate login accounts. Inviting an existing Vectora account or adding member roles beyond Admin still requires a separate membership flow.

## Brevo email verification

Supabase Auth sends confirmation messages through Brevo's SMTP relay; the app does not call Brevo directly. In Brevo, authenticate a sending domain, add the SPF/DKIM DNS records Brevo supplies, and create an SMTP key. In Supabase Authentication, go to SMTP Settings, enable custom SMTP, then enter:

| Setting  | Value                                                  |
| -------- | ------------------------------------------------------ |
| Host     | `smtp-relay.brevo.com`                                 |
| Port     | `587`                                                  |
| Username | The SMTP login shown in Brevo (not the host)           |
| Password | Brevo SMTP key (not the API key or account password)   |
| Sender   | A verified sender address on your authenticated domain |

Set the sender name to `Vectora` and keep email confirmation enabled. The **Confirm signup** template can contain `{{ .Token }}` to send a numeric signup code. Admin invitations use the separate **Invite user** template, which must include `{{ .ConfirmationURL }}` for its setup link. Supabase may require custom SMTP before allowing template edits. Without a domain, use Supabase's default email sender for testing. Keep SMTP credentials in Supabase's dashboard, never in `.env.local` or browser code. The Brevo relay host, supported ports, and SMTP-key requirement are documented in [Brevo's SMTP setup guide](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

## What the project needs

- A Supabase project: Auth, Postgres, Storage, and the migration in `supabase/migrations/`.
- A domain and Brevo account: authenticated sender domain, SPF/DKIM records, SMTP key, and transactional email sending enabled.
- App environment: Supabase project URL, publishable key, secret key, and app origin in `.env.local`; production hosting with those same variables and the production callback URL configured.
- Operations: backups/retention appropriate for the financial records, access to Supabase and Brevo dashboards, and a process for owner/admin account recovery.
- Product work not included yet: forgot/reset password screens, group settings/renaming, Admin deactivation, and a Super Admin transfer or group closure flow.

## Initial data

This setup starts with a clean Supabase database. Existing records and accounts from the previous backend are not copied.

## Useful commands

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the Next.js development server      |
| `npm run build`     | Create a production build                 |
| `npm run start`     | Serve the production build                |
| `npm run lint`      | Run ESLint                                |
| `npm run typecheck` | Generate route types and check TypeScript |
| `npm test`          | Run Vitest                                |

## Environment

`.env.local` is git-ignored. Keep `SUPABASE_SECRET_KEY` out of browser code and never prefix it with `NEXT_PUBLIC_`; it is required for sending Admin invitation emails. The publishable key is safe for browser use.
