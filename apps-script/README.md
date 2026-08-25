# Apps Script — private-layer write endpoint

`Code.gs` and `appsscript.json` here are **the source of truth**. The deployed
Web App is a copy. If you edit the script in the Apps Script editor, copy it
back into this folder and commit.

## What it is

A container-bound Apps Script Web App on the **private** spreadsheet
("Recipe Genius — Private"). It is the only thing that writes the household's
notes, ratings, and cooked-history. The public site never touches it.

## The two things that keep it safe

1. **`appsscript.json` restricts the script to this one spreadsheet**
   (`spreadsheets.currentonly`). The Web App is deployed "execute as me", so
   it runs with the owner's full Google identity — the OAuth scope is the only
   real containment. Never widen it to `drive` or bare `spreadsheets`.
2. **The device token is checked before any `SpreadsheetApp` call.** The
   deployment is open to anyone with the URL, so the token is the
   authentication. Checking it first means an unauthorized request costs
   almost none of the account-wide Apps Script quota.

## The token

Lives in **Project Settings → Script Properties**, key `DEVICE_TOKEN`.

It is **never** in this repo. This is a public repository — a token committed
here is a token published, permanently, including in git history where
deleting the file later does not remove it.

To rotate: change the Script Property, then re-pair each device.

## The deployment URL

Also never committed. It is entered on each device at pairing time, alongside
the token. `scripts/check-no-secrets.mjs` fails the build if a
`script.google.com/macros/s/` URL ever appears in a tracked file.

## After every edit

Apps Script serves the last **deployed** version, not the last **saved** one.
This is the single most common "my change didn't take" cause.

1. **Deploy** → **Manage deployments**
2. Click the pencil icon on the existing deployment
3. Set **Version** to **New version**
4. Click **Deploy**

The URL stays the same, so devices do not need re-pairing.

## Wire contract

Request — POST, `Content-Type: text/plain;charset=utf-8`, body is a JSON
string:

```json
{ "token": "…", "action": "saveNote", "recipeId": "…", "text": "…", "opId": "…" }
```

`text/plain` is required, not stylistic. Apps Script cannot set CORS response
headers, so an `application/json` body would trigger a preflight `OPTIONS`
request that fails. `text/plain` keeps it a CORS "simple request". Changing it
breaks the app in production only — never locally.

Response:

```json
{ "ok": true,  "data": { … } }
{ "ok": false, "error": "unauthorized" }
```

Actions: `loadPrivate`, `saveNote`, `setRating`, `markCooked`.
(`setWeekPlan` arrives with the week view in M8.)

Every mutating action takes an `opId`. The client queues writes while offline
and replays them, so the same op can legitimately arrive twice; applied
`opId`s are recorded in the `OpLog` sheet and duplicates are skipped. Without
that, a replayed `markCooked` silently double-counts `times_cooked`.

## Sheets it manages

- **`Private`** — `recipe_id`, `user_id`, `last_cooked`, `times_cooked`,
  `rating`, `notes`. Notes are append-only and dated.
- **`OpLog`** — `op_id`, `applied_at`, `action`. Idempotency ledger. Safe to
  trim old rows if it ever grows unwieldy; only recent ops can be replayed.

Both are created automatically on first write if missing.
