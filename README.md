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

## Folder layout

| Path | What it is |
| --- | --- |
| `public/` | The website (plain HTML/CSS/JS, no build step) |
| `api/board.js` | Public endpoint: reads the sheet, caches 60 s, rate-limited |
| `lib/board.js` | Turns the sheet's tabs into the leaderboard |
| `lib/sheets.js` | Google Sheets reader (service account, read-only) |

## What the site reads from the sheet

| Tab | Columns used |
| --- | --- |
| `REFERRALS` | NAME, INSTITUITION, SUBMISSIONS, REFERRALS TOTAL, one column per event |
| `DATA` | EVENT, INSTITUTE, SUBMISSIONS |
| `EXCLUDE` | column A: colleges that don't count (e.g. IEM Salt Lake, NA) |
| `SETTINGS` | EVENT, SUBMISSIONS OPEN? |

Columns are found by their **header text**, so reordering columns is fine. Renaming a header or a tab is
not: if you rename one, update `lib/board.js`. Referrers with 0 registrations and 0 submissions are hidden.
Excluded colleges never appear in the institution ranking, but their entries still count in the event totals.

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

3. **Deploy**. If you change a variable later: **Deployments → ⋯ → Redeploy**.

## Security

- The sheet stays Restricted; the site reads it with a read-only service account.
- Only names, institutions and counts are returned; every other column is ignored.
- Strict Content-Security-Policy with Trusted Types, no third-party scripts, frames blocked,
  `noindex` (student names stay out of search engines), per-IP rate limit, 60 s cache.
- `.gitignore` blocks sheet exports and key files from being committed.
