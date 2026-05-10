# OLF School Admin Portal — Setup Guide

## Step 1: Google Cloud Service Account

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "olf-school-portal") or select an existing one
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" in the API Library and click Enable
4. Create a Service Account:
   - Go to IAM & Admin → Service Accounts → Create Service Account
   - Name it anything (e.g. "olf-portal")
   - Skip optional role/user steps, click Done
5. Generate a JSON key:
   - Click the service account you just created
   - Keys tab → Add Key → Create new key → JSON
   - Download the .json file — keep it safe, don't share it

## Step 2: Share the Google Sheets

The service account has an email like `olf-portal@your-project.iam.gserviceaccount.com`.

Open **both** Google Sheets and click Share:
- Share with the service account email
- Give **Editor** access (so the portal can write back to the sheet)

Your sheets:
- Students: https://docs.google.com/spreadsheets/d/1S8KjoBfO3yPmvZom7v3BFP890iKF-uPQeq0_R3_F4Zg
- Fees: https://docs.google.com/spreadsheets/d/1UPOAYn9uUilTwbf5pPChFjvbmJlCgKN1PDGLAcKqevs

## Step 3: Configure Environment

Copy `.env.local.example` to `.env.local`:

```
cp .env.local.example .env.local
```

Edit `.env.local`:
- Paste the entire contents of your service account JSON as a single line for `GOOGLE_SERVICE_ACCOUNT_JSON`
- The sheet IDs are already filled in from the URLs above

## Step 4: Adjust Column Mappings

The portal reads from these sheet/column positions. If your actual sheet structure differs, update:
- `src/lib/sheets/students.ts` — the `COL` object maps column indices for "Correct Student name" sheet
- `src/lib/sheets/fees.ts` — the `COL` object maps column indices for "Fee details" sheet

The key columns needed:
| Sheet | Column | Used for |
|-------|--------|----------|
| Correct Student name | A=studentId, B=classId, C=name, G=phone, H=email, J=status, K=address | Student data |
| Fee details | B=studentId, C=classId, D=studentName, E=className, F=totalFee, G=Q1, H=Q2, I=Q3, J=Q4, K=notes | Fee data |

## Step 5: Run the Portal

```bash
npm run dev
```

Open http://localhost:3000 — it will redirect to /dashboard.

## How sync works

- **Portal → Sheet**: When you edit a student or update a fee, it calls the Google Sheets API directly and writes the cell
- **Sheet → Portal**: Every page load fetches fresh data from Google Sheets (no cache)
- Teachers can still edit directly in Google Sheets — the portal will show their changes on next page load
