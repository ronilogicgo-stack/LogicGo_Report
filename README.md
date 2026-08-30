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

## Upgrading an already-live project (v1 -> v5)

If your app is already deployed and you're pulling this update, run the
migration scripts **in order** before redeploying:

1. Go to your Supabase project -> **SQL Editor** -> New query.
2. Run `supabase/migration_v2.sql`, then `migration_v3.sql`, then
   `migration_v4.sql`, then `migration_v5.sql` - in that order, each in
   its own query.
3. Push this code to GitHub as normal - Vercel will redeploy automatically.

### What's new in v5
- **Corrected formulas.** Daily Collection Gap is now Net Sales minus
  Collections (matches your latest sheet exactly). Dues Recovery is now
  a computed figure (Collections minus Net Sales) instead of a manual
  target - exactly like your spreadsheet's "Monthly Dues Recovery" row.
- **Full Team Management page** (Admin -> "Team & Requests"). Every
  approved or paused sales person is always listed here - not just
  pending requests - showing their phone number, branch/region,
  employee ID, current status, and the date they last submitted a
  report. An Admin can edit any of those profile fields, or Pause/Resume
  access, right from this page.
- **New profile fields**: Phone Number and Employee/Branch ID, in
  addition to the existing Branch/Region field.
- **Colorful Analytics dashboard** (Admin -> "Analytics"). Switch
  between Daily / Weekly / Monthly / Yearly / Custom date ranges to see:
  Net Sales by Sales Person, Net Sales by Region/Branch, and a daily
  trend line - plus headline cards for Total Net Sales, Top Performer,
  and Top Region.

### What's new in v4
- **Per-field edit tracking.** Only the exact cell that was changed
  after an entry was first saved - Sales, Collections, Sales Return, or
  Remarks - turns red with a "×N" count. The rest of the row stays
  untouched, so it's obvious exactly what was corrected and how many
  times.

### What's new in v3
- **Per-employee detail page.** From the Admin dashboard, click any
  sales person's name to open their individual daily report - exactly
  like the separate tab each employee had in the original spreadsheet.
- **Admin can edit any entry**, using the exact same form and rules as
  the sales person's own dashboard.

### What's new in v2
- **Pause / Resume an employee.** A paused employee is signed out
  immediately and cannot log in or submit entries until an Admin clicks
  "Resume" - enforced both in the UI and at the database level.
- **Exact match to your Excel sheets** for every field.
- **Mobile friendly.** Both dashboards switch to stacked cards on phones.

## Extending later

- Add monthly PDF/Excel export (can reuse the same summary data).
- Add charts (e.g. using `recharts`) for trends.
- Add email notifications on request approval (Supabase has free email via SMTP or a service like Resend's free tier).
- Everything here runs comfortably within Supabase's free tier (500MB DB, 50k monthly active users) and Vercel's free tier (hobby projects) — no cost unless you outgrow it.
