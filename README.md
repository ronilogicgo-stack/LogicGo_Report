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

## Upgrading an already-live project (v1 -> v2 -> v3)

If your app is already deployed and you're pulling this update, run the
migration scripts **in order** before redeploying:

1. Go to your Supabase project -> **SQL Editor** -> New query.
2. Run `supabase/migration_v2.sql` (if you haven't already).
3. Run `supabase/migration_v3.sql`.
4. Push this code to GitHub as normal - Vercel will redeploy automatically.

### What's new in v3
- **Per-employee detail page.** From the Admin dashboard, click any
  sales person's name to open their individual daily report - exactly
  like the separate tab each employee had in the original spreadsheet.
  It shows every day they've reported, with the same monthly summary
  numbers.
- **Admin can edit any entry.** From that detail page, an Admin can add
  or correct a sales person's daily entry directly - using the exact
  same form and calculation rules as the sales person's own dashboard.
- **Edit tracking.** Any entry that gets changed after it was first
  saved - by the sales person or by an Admin - turns red and shows
  "Edited N×", so nothing gets silently altered without a visible trail.

### What's new in v2
- **Pause / Resume an employee.** On the Admin dashboard, each sales
  person row has a "Pause" button. A paused employee is signed out
  immediately and cannot log in or submit entries until an Admin clicks
  "Resume" - enforced both in the UI and at the database level (Row
  Level Security), so it can't be bypassed.
- **Exact match to your Excel sheets.** Every field from both the
  Admin master sheet and the per-employee daily sheet is now present:
  Opening Dues, Sales Target/Achievement, Collection Target/Achievement,
  Collection Gap, Sales Return, Net Sales, Dues Recovery Target, and
  Closing Dues - calculated with the same formulas as your spreadsheets.
- **Mobile friendly.** Both dashboards switch from tables to stacked
  cards automatically on phone-sized screens.

## Extending later

- Add monthly PDF/Excel export (can reuse the same summary data).
- Add charts (e.g. using `recharts`) for trends.
- Add email notifications on request approval (Supabase has free email via SMTP or a service like Resend's free tier).
- Everything here runs comfortably within Supabase's free tier (500MB DB, 50k monthly active users) and Vercel's free tier (hobby projects) — no cost unless you outgrow it.
