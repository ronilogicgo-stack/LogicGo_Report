# Sales Tracker SaaS (Free Stack)

Replaces your Excel sheet with a small web app:
- **Admin**: sees the same monthly summary table as your old sheet, sets targets, approves/rejects new employee requests.
- **Sales Person**: logs in, adds daily entries (Sales, Collections, Sales Return, Remarks), sees their own monthly summary — same calculations as everyone else.

Stack (100% free tier):
- **Next.js** — app code (deployed on **Vercel**, free)
- **Supabase** — auth + Postgres database (free tier)

---

## 1. Create a free Supabase project

1. Go to https://supabase.com → Sign up → "New Project".
2. Pick any name/region, set a database password (save it somewhere).
3. Wait ~2 min for it to spin up.
4. Go to **SQL Editor** → New query → paste the entire contents of `supabase/schema.sql` from this project → Run.
5. Go to **Project Settings → API**. Copy:
   - `Project URL`
   - `anon public` key

## 2. Configure the app

1. Copy `.env.local.example` to `.env.local`.
2. Paste in the Supabase URL and anon key you copied above.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxxx
```

## 3. Run locally (optional, to test)

```bash
npm install
npm run dev
```

Open http://localhost:3000

## 4. Create your first Admin

1. Go to `/signup` in the running app and register with your own email — this creates a "pending" request.
2. In Supabase → **Table Editor → profiles**, find your row and either:
   - Edit it directly (set `role` = `admin`, `status` = `approved`), or
   - Run this in **SQL Editor**:
     ```sql
     update public.profiles
     set role = 'admin', status = 'approved'
     where email = 'you@example.com';
     ```
3. Log in again at `/login` — you'll land on the Admin dashboard.

## 5. Deploy for free on Vercel

1. Push this folder to a new GitHub repo.
2. Go to https://vercel.com → Sign up (free) → "Add New Project" → import your repo.
3. In the Vercel project's **Settings → Environment Variables**, add the same two variables from `.env.local`.
4. Deploy. You'll get a free `https://your-app.vercel.app` URL.

---

## How the flow works

1. A new employee visits `/signup`, fills the form → a `pending` row is created in `profiles`.
2. Admin logs in, opens **Access Requests**, clicks **Approve** → the row becomes `role = sales_person`, `status = approved`.
3. That employee can now log in and lands on `/dashboard`, where they add daily entries.
4. Admin's `/admin` dashboard automatically picks up the new sales person and shows them in the same table, with the exact same formulas (`lib/calculations.js`) as everyone else — nothing needs to be hardcoded per person.

## Where the "Excel formulas" now live

All calculation logic (Net Sales, Collection Gap, Closing Dues, monthly totals) lives in
**one file**: `lib/calculations.js`. Both the Admin dashboard and the Sales Person dashboard
import from this same file, so every sales person — new or old — is always calculated the
same way. If you ever need to change a formula, change it once here.

## What's new in v13
- **CSV and PDF export everywhere.** Every report page - the Admin's
  Monthly dashboard, Daily Report, an individual employee's detail
  page, the Sales Person's own dashboard, and Analytics - now has a
  "⬇ CSV" button (downloads the exact data shown) and a "🖨 PDF" button
  (opens the browser's Print dialog, scoped to just the report content
  so navigation bars and buttons never show up in the PDF - "Save as
  PDF" is a built-in destination in every modern browser's print
  dialog).

## What's new in v12
- **Custom date range on the Daily Report page.** Switch between
  "Single Day" (as before) and "Date Range" - pick any From/To dates
  (e.g. "the last 3 days") and see combined totals per sales person,
  plus how many of those days each person actually reported. The chart
  updates to match; the Monthly Forecast section only applies to the
  Single Day view, since a forecast needs a specific month context.

## What's new in v11
- **Chart on the Daily Report page**: a colorful bar chart showing Net
  Sales by Sales Person for whatever date is selected.
- **Monthly Sales Forecast**: based on the daily average achieved so
  far this month (up to the selected date), the app projects what the
  full month's total would be if that same pace continued - shown as
  headline numbers and a stacked bar chart per sales person ("Achieved
  So Far" vs "Projected Remaining"). This is a simple run-rate
  projection, not a guarantee - it updates automatically as more days
  of real data come in.

## What's new in v10
- **Permanently delete an employee's account** (Admin -> "Team &
  Requests" -> "Delete Account"). This removes their login credentials,
  profile, and every daily entry and target - completely, from
  everywhere. It requires typing their name to confirm, since it can't
  be undone.
- **Download their data first.** A "Download Data" button exports that
  person's full entry history as a CSV file before you delete anything.
- **Freed email addresses can be reused.** Because deletion removes the
  actual Supabase Auth login record (not just our app's profile row),
  someone can sign up again later with that same email address.
- **New required setup step**: this feature needs a Supabase **Service
  Role key** (see "1a" below) - it's the only feature in the app that
  needs elevated, server-side database access, kept safely out of the
  browser.

### One-time setup for account deletion (do this once)
1. In Supabase -> **Settings -> API**, copy the **`service_role`** key
   (NOT the `anon` key - this one is secret and powerful).
2. In Vercel -> your project -> **Settings -> Environment Variables**,
   add a new variable:
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: (the key you copied)
   - **Do not** prefix it with `NEXT_PUBLIC_` - that would expose it to
     every visitor's browser, which would let anyone take over your
     entire database. Vercel keeps non-prefixed variables server-only.
3. Redeploy.

## What's new in v9
- **Daily Report page** (Admin -> "Daily Report") - mirrors your
  spreadsheet's "Daily Sales & Collection Summary" tab exactly: pick
  any single date and see every sales person's Sales Achievement,
  Collections Achievement, Gap, Sales Return, and Net Sales for that
  day, with a Grand Total row. Anyone who hasn't reported that day
  still shows up with zeros (greyed out), and any newly approved sales
  person appears automatically - no manual setup required.

## Upgrading an already-live project (v1 -> v8)

If your app is already deployed and you're pulling this update, run the
migration scripts **in order** before redeploying:

1. Go to your Supabase project -> **SQL Editor** -> New query.
2. Run `migration_v2.sql` through `migration_v8.sql` - each in its own
   query, in that exact order (v2, v3, v4, v5, v6, v7, v8).
3. **Also run this one-liner if you ever saw a "profiles_status_check"
   error when pausing someone** (fixes a constraint some early
   deployments were missing):
   ```sql
   alter table public.profiles drop constraint if exists profiles_status_check;
   alter table public.profiles add constraint profiles_status_check
     check (status in ('pending', 'approved', 'rejected', 'paused'));
   ```
4. Push this code to GitHub as normal - Vercel will redeploy automatically.

### What's new in v8
- **Multiple, independent roles per person.** The old single "role"
  (Sales Person *or* Admin) is now two separate checkboxes - Sales
  Person and Admin - that can both be checked on the same account. That
  person then sees both dashboards, with a link in each to switch to
  the other.
- **Any Admin can promote or demote any other profile**, including
  granting/removing Admin rights - there's no special "super admin";
  all Admins have equal, symmetric rights. (An Admin can't remove their
  *own* Admin checkbox, to prevent accidentally locking themselves out.)
- **Approving a pending request now lets you choose the role(s)**
  (Sales Person and/or Admin) right there, instead of always defaulting
  to Sales Person.

### What's new in v7
- **Self-service profile editing** (My Profile page) for name, phone,
  branch/region, and employee ID.
- **Email changes require Admin approval** and lock the account out of
  all edits until resolved.
- **A paused account is fully frozen**, including profile edits, at the
  database level.

### What's new in v6
- Fixed the Region/Branch analytics chart for negative values.
- A sales person can set/edit their own Opening Dues, Sales Target, and
  Collection Target directly from their dashboard.

## Extending later

- Add monthly PDF/Excel export (can reuse the same summary data).
- Add charts (e.g. using `recharts`) for trends.
- Add email notifications on request approval (Supabase has free email via SMTP or a service like Resend's free tier).
- Everything here runs comfortably within Supabase's free tier (500MB DB, 50k monthly active users) and Vercel's free tier (hobby projects) — no cost unless you outgrow it.
