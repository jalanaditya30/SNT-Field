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

## Adding the other 36 MRs

Only `data.js`:

```js
{ id: "mr05", name: "Name Here", division: "Novocamp" },
```

`id` must be unique and **must never change** once it's been used — the Log is keyed on it.

## How the data sits

`Log` sheet is append-only — every submission is a row, forever. Nothing is overwritten, so you have a full audit trail including corrections. The dashboard takes the **last row per MR for today**, so an MR who marks Mehsana at 9:00 and corrects to Visnagar at 14:00 shows as Visnagar, and both rows survive in the sheet.

`snapshotDaily()` is optional. Add a time-driven trigger at 11:05 IST if you want a frozen record of the board at call time rather than end-of-day.

## Notes

- **No login.** Anyone with the link can mark as anyone. This is deliberate — it's a coordination board, not attendance for payroll. If it gets abused, the fix is per-MR links (`?id=mr07`), not passwords.
- **LATE tag** appears on anything marked at or after `CUTOFF_HOUR` (11:00). It's a visible tag, not a lock — people can still mark at 4 PM, and you can still see they did.
- **The phone remembers the MR's name** after the first use, so day 2 onward is: open link → tap status → tap town → send.
