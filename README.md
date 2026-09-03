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

## What's new in v23 - Payment Follow-Up module
- **Branch-wise Payment Follow-Up tracker**, replacing the Google
  Sheet + Apps Script version. Same idea: each record (company/client)
  can have up to 5 follow-up dates, and the list automatically sorts
  itself:
  - 🔴 **Overdue** - payment still Due and the latest follow-up date
    has arrived or passed - shown first.
  - 🟡 **Due tomorrow** - latest follow-up date is tomorrow - shown next.
  - **On track** - everything else, sorted by serial number.

  Unlike the spreadsheet version, there's no locking or physical row
  reordering needed - the app just sorts fresh on every page load, so
  multiple people can use it at once with no conflicts.
- **Per-branch team access** (Admin -> "Payment Follow-Up" -> "Manage
  Team Access"). Grant any team member **Editor** (can add/edit/delete
  records) or **Viewer** (read-only) access to one specific branch -
  completely separate from their Sales Person/Admin role. A team
  member with access sees a "Payment Follow-Up" link on their own
  dashboard leading to just the branch(es) they've been granted.
- **Admin can add new branches** any time (Head Office, Sylhet, and
  Rangpur are pre-loaded from your existing spreadsheet - see setup
  step below).
- CSV/PDF export included, same as every other report.

### One-time setup for v23
1. Run `migration_v23.sql` in the Supabase SQL Editor (creates the
   branches, records table, and access-control tables/policies).
2. Run `seed_payment_followups.sql` right after it, in the same SQL
   Editor, to import all 252 existing records from your spreadsheet
   (Head Office, Sylhet, and Rangpur) exactly as they were. It's safe
   to run more than once - it skips rows that are already there.
3. Push the new app code and redeploy.
4. As Admin, go to "Payment Follow-Up" -> "Manage Team Access" to grant
   your team members access to their branch(es).

## What's new in v22 (visual design refresh)
- **New typography**: Inter for interface text, and a monospaced
  numeral font (JetBrains Mono) for every money/number figure across
  the app - digits line up visually like a ledger, instead of a
  generic system font.
- **Icons on every metric card** (Opening Dues, Sales Target, Net
  Sales, etc.) via lucide-react, so each number is recognizable at a
  glance rather than just another undifferentiated box.
- **Refined card style**: swapped heavy drop shadows for a subtle
  border + light shadow across every card, table, and form on both the
  Admin and Sales Person panels, for a cleaner, more "financial ledger"
  feel instead of the generic stacked-card look.
- Extracted the metric card into one shared `SummaryCard` component
  (used by both the Sales Person's dashboard and the Admin's
  per-employee page), so any future styling change only needs to
  happen in one place.

Note: Google Fonts are fetched at build time - this requires normal
internet access during the Vercel build (which it always has); no
setup is needed on your end.

## What's new in v21
- **New field: Other Transaction.** A free-form daily adjustment
  (bonus, write-off, correction, etc. - positive or negative) added to
  the Daily Entry form, Entry History table, Admin dashboard, Daily
  Report, employee detail page, Sales Person dashboard, and every
  CSV export. It's tracked and highlighted on edit exactly like Sales,
  Collections, Sales Return, and Remarks.
- **Updated formulas** to include it, matching the reference "SR Wise
  Statement" report:
  ```
  Closing Dues  = Opening Dues + Net Sales - Collections + Other Transaction
  Dues Recovery = Collections - Net Sales - Other Transaction
  ```
  Net Sales and Collection Gap are unaffected - they stay purely
  Sales/Collections/Sales-Return based, exactly as before.

## What's new in v20 (visual only, calculations unchanged)
- **"Above target" green highlight**, to match v19's red "below
  target" flag. Sales/Collection Achievement now turns green when it
  exceeds that month's target, stays red when it's under, and looks
  normal when it's exactly on target - on the Admin dashboard, an
  employee's detail page, and the Sales Person's own dashboard. Purely
  visual, same as before: no calculation ever changes because of it.

## What's new in v19 (visual only, calculations unchanged)
- **"Below target" red highlight.** Sales Achievement or Collection
  Achievement now turns red with a small "Below target" note whenever
  it's under that month's target - on the Admin dashboard, an
  individual employee's detail page, and the Sales Person's own
  dashboard. This is purely a visual flag: it never changes Net Sales,
  Collection Gap, Closing Dues, or Dues Recovery, which are always
  calculated from the real achievement numbers alone, never the target.

## What's new in v18 (correctness at scale)
- **Fixed a silent data-truncation risk with years of history.**
  Supabase caps every single request at 1000 rows by default - a
  detail that doesn't matter for a small team's first year, but a wide
  Analytics range, a long custom Daily Report range, or an
  all-time "Download Data" CSV export could quietly return *incomplete*
  totals once a few years of daily entries pile up, with no error
  shown. These now page through all matching rows automatically, so
  the numbers stay correct no matter how much history has accumulated.
  (The Admin's main monthly dashboard was already safe from this,
  since v17 made it fetch pre-totaled rows instead of raw entries.)

## What's new in v17 (performance, part 2)
- **Admin's main dashboard is now much lighter.** It used to download
  every single daily entry for every sales person for the whole month,
  then add them up in the browser. It now fetches one already-totaled
  row per person straight from the database (via a new
  monthly_entry_totals view) - the more months of history a company
  builds up, the bigger this difference gets.

## What's new in v16 (performance)
- **Fixed slow data loading.** Several pages were querying the database
  one request after another (waiting for each to finish before starting
  the next) when the queries didn't actually depend on each other -
  they now run at the same time, roughly halving load time on the
  Admin dashboard, Daily Report, employee detail page, and Sales
  dashboard.
- **Team page's "Last report" column** used to download every daily
  entry ever recorded for every sales person just to find the most
  recent date - that only gets slower as more data piles up. It now
  uses a database view that computes this instantly in Postgres.
- **Uploaded photos are now compressed automatically** (resized to
  400px, converted to JPEG) before saving - a multi-megabyte phone
  photo used to get uploaded as-is and then re-downloaded on every
  single page (since it shows in the navbar everywhere), which could
  make the whole app feel sluggish.
- **New database indexes** speed up the filters used on nearly every
  page (date ranges, sales-person/status lookups).

## What's new in v15
- **Forgot Password.** A "Forgot password?" link on the login page lets
  anyone request a reset email, then set a new password - a real gap
  before this (there was no recovery path at all if someone forgot
  their password).
- **Search box on the Team page**, filtering by name or email - useful
  once the team grows past a handful of people.

### One-time setup for v15
Supabase's password-reset emails redirect back to your app at
`/reset-password`. Add that URL to the allow-list:
1. Supabase -> **Authentication -> URL Configuration**.
2. Under "Redirect URLs", add: `https://YOUR-APP-URL.vercel.app/reset-password`
   (use your real Vercel URL - and add `http://localhost:3000/reset-password`
   too if you test locally).
3. Save. No SQL migration is needed for this version.

## What's new in v14
- **Bug fixes from a full audit**: the Admin dashboard's "Edit Targets"
  save button now shows an error if it fails (it used to fail silently);
  the Analytics CSV export no longer risks mixing up two people who
  happen to share the same name (it now matches by their unique ID
  instead of their name); removed a leftover unused import. All
  calculation formulas (Net Sales, Collection Gap, Dues Recovery,
  Closing Dues) were re-verified for consistency across every page -
  no mismatches found.
- **Company logo** (Admin -> "Settings"). Upload once and it shows in
  the navigation bar on every page, for both Admins and Sales Persons.
- **Profile photos** (Sales Person -> "My Profile"). Each sales person
  can upload their own photo, shown in the navbar, the Team list, and
  their individual detail page (falls back to a colored initial if no
  photo is set).
- **Colorful redesign**: navigation bars now use an indigo-to-purple
  gradient with the logo/avatar built in; the login and signup pages
  got a matching gradient background and rounder, more polished cards.

### One-time setup for v14 (do this in addition to the SQL migration)
This version adds file uploads (logo + photos), which need two Storage
buckets. `migration_v14.sql` creates them automatically - just run it
like any other migration in the Supabase SQL Editor. No extra manual
bucket setup is needed.

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
