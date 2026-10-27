# Pratikriti · Institutional Referral Counter

Public leaderboard for the **Pratikriti out-house referral drive** (Day 0 of IEMPACT, IEM Photography Club).

- **Leading institution** with its submission count, in a hero card.
- **Top referrers 1-2-3** (name + institution), then the rest of the list.
- **Institutions** ranked by submissions.
- **Event-wise** totals.

Everything is ranked by **submissions**, not registrations. Events whose submissions aren't open yet
show registrations and "Opens soon".

```
"Pratikriti – Out House Referral Sheet" (Restricted)
        │  read-only, Google service account
        ▼
Vercel function /api/board ── names, institutions, counts only ──► browser
```

Phone numbers, emails, payment details and **referral codes** are never sent to the browser. Codes end
in phone digits, so they stay private too.

## Representative portal

A **Rep login** button in the header lets each college representative sign in with their
**referral code** and a **password** from the sheet. They then see a welcome page with their
registrations, submissions and rank, an event filter, and the list of people who registered with
their code. Tap a person to see their phone number (tap to call), college, event, genre and date.
Every registration made with a rep's code counts for that rep, whatever college the person
gave (their own college, another one, IEM, or none).

**What to add to the sheet (once):**

1. In the **REFERRALS** tab, put the header **PASSWORD** in the first empty column (e.g. K1).
2. Open **Extensions → Apps Script**, add a new script file, paste `apps-script/RepPasswords.gs`,
   and save. Reload the sheet: a **Referral portal** menu appears.
3. **Referral portal → Generate missing passwords** fills an easy password (a word + 3 digits, like `shutter482`) for every
   row that has a referral code. Run it again whenever you add new referrers; existing passwords stay.
   **Reset password for selected row(s)** issues a new one and signs that rep out; **Replace ALL
   passwords** renews everyone's. Passwords are checked ignoring capital letters and spaces.
4. Select a rep's row (or several) and use **Referral portal → Welcome message for selected row(s)**:
   it shows a ready-to-send greeting with their code, password and the website link, with
   **Copy message** and **Send on WhatsApp** buttons (WhatsApp opens a chat with their MOBILE number).

You can also type passwords by hand. The forms don't ask for year of study, so the portal can't
show it; add a "Year" question to the forms if you need it.

**Security:** passwords are only read on the server and never sent to any browser. Sessions last
7 days in an HttpOnly, Secure, SameSite=Strict `__Host-` cookie signed with `SESSION_SECRET` and
tied to the current password. Wrong attempts are limited per connection (8), per code (10) and
overall per 15 minutes. A rep can only ever see registrations made with their own code.

## Folder layout

| Path | What it is |
| --- | --- |
| `public/` | The website (plain HTML/CSS/JS, no build step) |
| `api/board.js` | Public leaderboard (names, institutions, counts only) |
| `api/login.js` | Representative sign-in / sign-out |
| `api/me.js` | The signed-in representative's own registrations (private) |
| `lib/store.js` | Shared, cached sheet loader |
| `lib/reps.js` | Finds a rep and collects their registrations from the RAW_ tabs |
| `lib/session.js` | Signed session cookie, lockouts |
| `apps-script/RepPasswords.gs` | "Referral portal" menu that generates passwords in the sheet |
| `lib/board.js` | Turns the sheet's tabs into the leaderboard |
| `lib/sheets.js` | Google Sheets reader (service account, read-only) |

## What the site reads from the sheet

| Tab | Columns used |
| --- | --- |
| `REFERRALS` | NAME, INSTITUITION, SUBMISSIONS, REFERRALS TOTAL, one column per event |
| `DATA` | EVENT, INSTITUTE, SUBMISSIONS |
| `EXCLUDE` | column A: colleges left out of the institution ranking (e.g. IEM Salt Lake, NA) |
| `RAW_<EVENT>` | form responses: name, college, the referral code column and photo count column named in SETTINGS |
| `SETTINGS` | EVENT, REFERRAL COL, COUNT COL, SUBMISSIONS OPEN? |

Columns are found by their **header text**, so reordering columns is fine. Renaming a header or a tab is
not: if you rename one, update `lib/board.js`. Referrers with 0 registrations and 0 submissions are hidden.
Excluded colleges never appear in the institution ranking, but their entries still count in the event totals
and for the referrer whose code they used. Referrer counts are taken straight from the RAW_ form tabs
(every use of a code counts); the REFERRALS tab's own SUBMISSIONS / REFERRALS TOTAL columns are only used
if the RAW_ tabs can't be read.

## Setup

### 1. Service account (skip if you already made one for the registrations dashboard)

You can reuse the same service account and the same JSON key. Just do step 2 for this sheet.

1. Go to <https://console.cloud.google.com/> and pick (or create) a project.
2. Search **Google Sheets API** in the top bar, open it, and click **Enable**.
3. Open **IAM & Admin → Service Accounts → Create service account**. Give it a name and click
   **Create and continue**. **Skip roles**: leave "Select a role" empty and click **Continue**, then **Done**.
4. Click the new account, open **Keys → Add key → Create new key → JSON → Create**. A `.json` file
   downloads. Keep it private and never commit or post it.
5. Copy the account's **email** (it ends in `.iam.gserviceaccount.com`).

### 2. Share the referral sheet with it

Open the **Pratikriti – Out House Referral Sheet** → **Share** → paste the service-account email →
**Viewer** → untick "Notify people" → **Share**. General access can stay **Restricted**.

The sheet pulls data from the event response sheets with IMPORTRANGE. If a RAW_ tab shows `#REF!`,
click its A1 cell and press **Allow access** once while signed in as yourself.

### 3. Deploy on Vercel

1. <https://vercel.com> → **Add New… → Project** → import **Deepan003/PRATIKRITI-LEADERBOARD**.
   Framework preset: **Other**.
2. Add **Environment Variables**:

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | open the downloaded `.json`, copy everything, paste |
| `REFERRAL_SHEET` | the referral sheet's link (or just its ID) |
| `SESSION_SECRET` | any long random text (signs rep sessions; changing it signs everyone out) |

3. **Deploy**. If you change a variable later: **Deployments → ⋯ → Redeploy**.

## Security

- The sheet stays Restricted; the site reads it with a read-only service account.
- Only names, institutions and counts are returned; every other column is ignored.
- Strict Content-Security-Policy with Trusted Types, no third-party scripts, frames blocked,
  `noindex` (student names stay out of search engines), per-IP rate limit, 60 s cache.
- `.gitignore` blocks sheet exports and key files from being committed.
