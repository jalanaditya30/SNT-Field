# SNT Field Board

Daily field-location marking for the marketing team. Static front-end on GitHub Pages, Google Sheet as the database via an Apps Script Web App.

- `index.html` — what the MR opens (mobile)
- `dashboard.html` — what your 11 AM person opens
- `data.js` — **the only file you edit day to day**: MR list, zones, towns, API URL
- `Code.gs` — Apps Script backend
- `style.css` — shared styles

## Setup, in order

**1. Sheet**
Create a Google Sheet. `File ▸ Settings ▸ Time zone` → **(GMT+05:30) India Standard Time**. This matters — the backend stamps the date, not the phone.

**2. Script**
`Extensions ▸ Apps Script`. Delete the stub, paste all of `Code.gs`, save.

**3. Deploy**
`Deploy ▸ New deployment ▸ Web app`
- Execute as: **Me**
- Who has access: **Anyone**

Authorise it (you'll get an "unverified app" warning — Advanced → Go to project → Allow; it's your own script). Copy the URL ending in `/exec`.

**4. Wire it up**
Paste that URL into `data.js` → `API_URL`.

**5. Publish**
Push the folder to a GitHub repo → `Settings ▸ Pages ▸ Deploy from branch ▸ main / root`.
MRs get `…/index.html`. Your 11 AM person gets `…/dashboard.html` — **do not put that link in the MR group.**

## Re-deploying after an edit

Editing `Code.gs` does nothing live until you go `Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy`. The URL stays the same. This is the step everyone forgets.

Editing `data.js` is instant — just push to GitHub (allow ~1 min for Pages, and tell people to pull down to refresh).

## "Unexpected token '<' … is not valid JSON"

The site asked the script for data and got a Google **web page** back instead — a sign-in page or "page not found". The code is fine; the deployment is the problem. Check, in order:

1. `Deploy ▸ Manage deployments ▸ ✏️` — **Who has access** must be **Anyone**. "Anyone with a Google account" also breaks it, because the fetch carries no login.
2. Same dialog — pick **Version: New version**, then **Deploy**. Saved code edits do nothing until this.
3. If you ever made a **new deployment** (instead of editing the existing one), the URL changed — copy the current `/exec` URL into `API_URL` in `data.js` and push.
4. If the editor shows an authorisation banner after a code change, run any function once and approve it, then redeploy.

## Adding, renaming, and removing MRs — no code

The live MR list is the **`Master` tab** of the Sheet. Run `SETUP_createMasterTab()` once from the editor to create it.

| MR ID | MR Name | Division | Active |
|-------|---------|----------|--------|
| mr01  | Rohit   | LCM      | Y      |

- **Add** → new row. Live within 60 seconds. Nothing to deploy, nothing to push.
- **Rename** → edit the Name cell. Keep the ID.
- **Leaver** → set Active to `N`. Never delete the row, or their history orphans.

`MR ID` must be unique and **must never change once used** — the Log is keyed on it.

`data.js` still carries a copy of the list. That is a **fallback only**, used if the sheet can't be reached so the form doesn't die on bad signal. Refresh it occasionally; day to day, ignore it.

## Adding a town or zone

Towns change roughly never, so they stay in code. Edit `ZONES` in `data.js`, push to GitHub. Live in about a minute.

## How the data sits

`Log` holds **one row per MR** — their current mark. Marking again overwrites that same row (date, time, status, zone, towns, note), so the sheet never grows past your MR count. An MR who marks Mehsana at 9:00 and corrects to Visnagar at 14:00 ends the day as one Visnagar row. Towns and zones are stored comma-joined in a single cell, since an MR can pick several of each in one entry.

**The board shows today only.** Each row carries the date it was last marked. The dashboard reads every row and shows the ones dated today; an MR whose row still says yesterday counts as "not marked" until they mark again. The Log stays tiny — ~4 rows now, ~40 at full strength — so reads are fast with no index to maintain.

**Trade-off: no history.** Because rows are overwritten, there's no record of past days. If you later want a daily archive, turn on `snapshotDaily()` — add a time-driven trigger at 11:05 IST and it appends that morning's board to a separate `Snapshots` tab, one frozen record per day. That's the place for history; `Log` is only ever "right now".

Sorting or reordering `Log` is now harmless — there's no index to break.

## Editor functions

| Run this | When |
|---|---|
| `SETUP_createMasterTab()` | Once, at setup |
| `SETUP_collapseToOnePerMR()` | Once, right after switching to this backend — collapses old append-only history to one row per MR |
| `WHERE_IS_MY_DATA()` | "The sheet is empty" — prints the real URL, tabs, timezone |
| `TEST_writeRow()` | Writes/overwrites a dummy row and shows the actual error if it fails |

## Notes

- **No login.** Anyone with the link can mark as anyone. This is deliberate — it's a coordination board, not attendance for payroll. If it gets abused, the fix is per-MR links (`?id=mr07`), not passwords.
- **The phone remembers the MR's name** after the first use, so day 2 onward is: open link → tap status → tap town → send.
