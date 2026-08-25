# M6 Implementation Plan — Write Path + Device Pairing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the household a private layer — dated notes, ratings, and cooked-history — that lives in the private spreadsheet, reaches both phones, survives being offline, and is invisible to anyone who opens the public site. Plus the device-pairing UI that gates it, with visible state and an obvious re-pair path.

**Architecture:** A container-bound Apps Script Web App on the **private** spreadsheet is the only write endpoint. The browser talks to it through `js/data/apps-script-source.js`, which is the only new code allowed to call `fetch` (M2b's rule). Everything else is pure and unit-tested with an injected fetch: pairing state, the offline write queue, and the private-cache merge. The unpaired state renders exactly as the public site — no error, no missing-data message, just absent.

**Tech Stack:** Same as every prior milestone — vanilla ESM, zero build step, `node --test`, zero npm dependencies. Plus Google Apps Script (V8 runtime) for `apps-script/Code.gs`.

## Global Constraints

- **The Web App URL is a secret and must never be committed.** It is entered at pairing time alongside the token and lives only in `localStorage`. No default, no realistic-looking placeholder. CI greps for it (Task 9).
- **The token is checked before any `SpreadsheetApp` call.** A request with a missing or wrong token must cost as little of the account-wide Apps Script quota as possible. This is the only containment against a stranger who finds the URL.
- **OAuth scope is `spreadsheets.currentonly`, declared explicitly in `appsscript.json`.** Never `drive`, never bare `spreadsheets`. "Execute as me" means the endpoint acts with Paula's full Google identity; scope is the real boundary.
- **Requests are POST with `Content-Type: text/plain;charset=utf-8`.** Apps Script cannot set CORS response headers, so an `application/json` body triggers a preflight `OPTIONS` that fails. `text/plain` keeps it a CORS "simple request"; the body is still a JSON string, read via `e.postData.contents`. Verified current 2026-08. This is a hard requirement — a future "tidy-up" to `application/json` breaks the app in production only.
- **Every mutating request carries a client-generated `opId`, and the script is idempotent on it.** The offline queue replays, and a replayed `markCooked` that double-increments `times_cooked` is silent data corruption.
- **Private data never touches `data/library.json`.** M1's allowlist gate already enforces this; nothing in M6 may add a field to a recipe object.
- **Unpaired is not an error state.** No "you need to pair" banner on Browse. The private UI simply does not render. Only Settings shows pairing state.
- **Notes are append-only and dated.** A note is added, never replaced.
- **A failed write is never silently dropped.** It queues, the UI says so, and Settings shows the pending count.
- Zero npm dependencies, zero build step, Node >=20 for tests.

---

### Task 1: `apps-script/Code.gs` + `appsscript.json` — the write endpoint

Committed as version-controlled source. It is pasted into the Apps Script editor in Task 8; the repo is the source of truth for what *should* be deployed.

**Files:**
- Create: `apps-script/Code.gs`, `apps-script/appsscript.json`, `apps-script/README.md`

**Interfaces (the wire contract every later task codes against):**
- Request: POST, `text/plain`, body = JSON `{ token, action, ...args }`
- Response: JSON `{ ok: true, data }` or `{ ok: false, error }`
- Actions: `loadPrivate`, `saveNote`, `setRating`, `markCooked`

- [ ] **Step 1: Write `apps-script/appsscript.json`** — `runtimeVersion: V8`, `oauthScopes: ["https://www.googleapis.com/auth/spreadsheets.currentonly"]`, `webapp.executeAs: USER_DEPLOYING`, `webapp.access: ANYONE_ANONYMOUS`.

- [ ] **Step 2: Write `apps-script/Code.gs`** — full source in the repo. Load-bearing details:
  - `getExpectedToken_()` reads `DEVICE_TOKEN` from Script Properties. Never hardcoded — this file is in a public repo.
  - `tokensMatch_()` compares length-independently.
  - `doGet()` returns `{ok:false,error:'unsupported'}` — pasting the URL in a browser bar must yield a flat wall, never data.
  - `doPost()` parses the body, then checks the token **before** any `SpreadsheetApp` access, then switches on `action`.
  - Sheet access is by header *name*, never fixed index — columns get reordered by hand.
  - `alreadyApplied_(opId)` / `recordOp_()` back the idempotency guarantee using an `OpLog` sheet.
  - `saveNote_` appends `YYYY-MM-DD — text` joined with a real `\n` from a JS string literal — never a placeholder token needing a later find-and-replace (the M0 lesson).

- [ ] **Step 3: Write `apps-script/README.md`** — repo is source of truth; token goes in Script Properties; **re-deploy is required after every edit** (Apps Script serves the last *deployed* version, not the last saved one — the single most common "my change didn't take" cause).

- [ ] **Step 4: Commit.**

---

### Task 2: `js/ui/pairing.js` — pairing state

**Files:** Create `js/ui/pairing.js`; test `test/pairing.test.mjs`

**Interfaces:** `loadPairing()`, `savePairing({endpoint, token})`, `clearPairing()`, `isPaired(pairing)`, `validateEndpoint(url)` — consumed by Tasks 3, 5, 7. Storage key `recipe-genius:pairing`, deliberately separate from `recipe-genius:settings`: pairing is per-device and clearing settings must never silently unpair a phone.

- [ ] **Step 1: Write the failing tests** — defaults to unpaired; round-trips endpoint+token; `clearPairing` removes both; `isPaired` requires BOTH fields non-empty; `validateEndpoint` accepts only `https://script.google.com/macros/s/<id>/exec` and rejects `http:`, a non-Google host, and `javascript:`; a corrupt JSON blob yields unpaired rather than throwing.
- [ ] **Step 2: Confirm failure. Step 3: Implement. Step 4: Confirm pass. Step 5: Commit.**

`validateEndpoint` is a security control, not politeness: the endpoint is user-entered and then POSTed to *with the token*, so a typo'd or hostile host exfiltrates it.

---

### Task 3: `js/data/apps-script-source.js` — the private-layer client

**Files:** Create `js/data/apps-script-source.js`; test `test/apps-script-source.test.mjs`

**Interfaces:** `createAppsScriptSource({ pairing, fetchImpl = fetch })` returning `{ loadPrivate(), saveNote(), setRating(), markCooked(), capabilities }`. `capabilities` is `{write:true, private:true}` when paired and `{write:false, private:false}` when not — the boolean pair M2b's data-layer contract already promised, which the UI reads instead of checking for a token itself.

- [ ] **Step 1: Write the failing tests** covering:
  - the request is POST with `Content-Type: text/plain;charset=utf-8` (assert on the recorded init object — this pins the CORS constraint)
  - the body is a JSON string carrying `token` and `action`
  - `{ok:true,data}` resolves to `data`; `{ok:false,error}` rejects with that error
  - a non-ok HTTP status rejects
  - an HTML response body (Google's sign-in interstitial, i.e. wrong deployment access) rejects with a message naming the likely cause, not a raw JSON parse error
  - unpaired `capabilities` are both false and every write rejects **without calling fetch at all**
- [ ] **Step 2-5: Red, implement, green, commit.**

---

### Task 4: `js/data/write-queue.js` — offline queue with replay

**Files:** Create `js/data/write-queue.js`; test `test/write-queue.test.mjs`

**Interfaces:** `loadQueue()`, `enqueue(op)`, `dequeue(opId)`, `queueLength()`, `replayQueue(source, queue)`. An op is `{ opId, action, args, queuedAt }`; `opId` from `crypto.randomUUID()`.

- [ ] **Step 1: Write the failing tests** — enqueue/load round-trips; ops replay FIFO; a successful replay removes only that op; a failing replay leaves it queued and **stops rather than skipping ahead**, preserving order; replay on an empty queue is a no-op; a corrupt blob yields an empty queue; the same `opId` cannot be enqueued twice.
- [ ] **Step 2-5: Red, implement, green, commit.**

---

### Task 5: Pairing UI in Settings

**Files:** Modify `js/views/settings.js`, `css/app.css`, `test/settings-view.test.mjs`

**Interfaces:** `renderSettings(avoidances, protocols, settings, pairing, queueCount)` — two new trailing params, defaulted so existing call sites and tests keep working.

- [ ] **Step 1: Write the new tests.** Paired: shows "Paired as household", a Re-pair and an Unpair control, and **never renders the token or endpoint back to the page**. Unpaired: two labelled inputs plus a Pair button, with reassuring copy — *"This device isn't paired. Your notes are safe — pair again to see them."* Pending-queue count renders when > 0.
- [ ] **Step 2-5: Red, implement, green, commit.** Token input is `type="password"`, `autocomplete="off"`.

---

### Task 6: Notes and rating on the recipe detail view

**Files:** Modify `js/views/recipe.js`, `css/app.css`, `test/recipe-view.test.mjs`

**Interfaces:** `renderRecipe(recipe, avoidances, privateEntry = null, capabilities = { private: false })` — two new trailing params, defaulted.

- [ ] **Step 1: Write the new tests.** With `capabilities.private === false`: **no** note section, no rating control, no cooked affordance — assert their absence, since this doubles as the public-view privacy test. With private enabled: existing dated notes render as separate escaped lines; the rating is five real `<button>`s with `aria-pressed`; "Made it" renders; `timesCooked`/`lastCooked` render when present. A note containing markup is escaped.
- [ ] **Step 2-5: Red, implement, green, commit.**

---

### Task 7: Wire it up in `js/app.js`

No unit tests — same live-verified-orchestrator convention as every prior milestone.

- [ ] **Step 1:** Construct `appsScriptSource` from `loadPairing()`. `createStaticJsonSource` stays exactly as-is; the private source is additive, never a replacement.
- [ ] **Step 2:** Load the private layer after the public one, **non-blockingly** — a private-layer failure must never stop recipes rendering. Cache to `recipe-genius:private-cache` on success and read from it when the fetch fails, so notes and ratings work offline.
- [ ] **Step 3:** Wire the Settings pairing form. Pair validates the endpoint, saves, then immediately attempts `loadPrivate` as a live credential check. A bad token must say *"That token was rejected"*, never *"Something went wrong"*.
- [ ] **Step 4:** Wire notes/rating/Made-it. Every write goes through the queue: enqueue, attempt immediately, and on failure leave it queued and say it will send later.
- [ ] **Step 5:** Local autosave for the in-progress note — save to `recipe-genius:note-draft:<recipeId>` on every `input`, restore on render, clear only after a confirmed save. Losing a half-typed note to an interruption is the most common recipe-app complaint.
- [ ] **Step 6:** Replay the queue on `online` and on boot.
- [ ] **Step 7: Commit.**

---

### Task 8: Deploy the Apps Script — Paula's manual steps

One physical action per line. Nothing here is done by the agent; the token and URL must never reach the repo or the transcript.

- [ ] **Step 1:** Open `https://drive.google.com`.
- [ ] **Step 2:** Open the spreadsheet **"Recipe Genius — Private"**.
- [ ] **Step 3:** In the menu bar, click **Extensions**.
- [ ] **Step 4:** Click **Apps Script**. A new tab opens.
- [ ] **Step 5:** Click the project name ("Untitled project") at top left, rename it to `Recipe Genius Private API`, click **Rename**.
- [ ] **Step 6:** Select all the code in `Code.gs` and delete it.
- [ ] **Step 7:** Copy the entire contents of `apps-script/Code.gs` from the repo and paste it in.
- [ ] **Step 8:** Press **Ctrl+S**.
- [ ] **Step 9:** In the left sidebar, click the gear icon (**Project Settings**).
- [ ] **Step 10:** Tick **"Show 'appsscript.json' manifest file in editor"**.
- [ ] **Step 11:** In the left sidebar, click the `< >` icon (**Editor**).
- [ ] **Step 12:** Click `appsscript.json` in the file list.
- [ ] **Step 13:** Select all its contents and delete them.
- [ ] **Step 14:** Copy the contents of `apps-script/appsscript.json` from the repo and paste them in.
- [ ] **Step 15:** Press **Ctrl+S**.
- [ ] **Step 16:** Invent a device token — a random string of at least 32 characters, from a password manager's generator. Save it somewhere safe; you need it on each device.
- [ ] **Step 17:** In the left sidebar, click the gear icon (**Project Settings**).
- [ ] **Step 18:** Scroll to **Script Properties**, click **Add script property**.
- [ ] **Step 19:** In **Property**, type exactly: `DEVICE_TOKEN`
- [ ] **Step 20:** In **Value**, paste the token from Step 16.
- [ ] **Step 21:** Click **Save script properties**.
- [ ] **Step 22:** In the left sidebar, click the `< >` icon (**Editor**).
- [ ] **Step 23:** At the top right, click **Deploy**.
- [ ] **Step 24:** Click **New deployment**.
- [ ] **Step 25:** Next to "Select type", click the gear icon and choose **Web app**.
- [ ] **Step 26:** In **Description**, type `v1`.
- [ ] **Step 27:** Set **Execute as** to **Me (your email)**.
- [ ] **Step 28:** Set **Who has access** to **Anyone**. (Not "Anyone with Google account" — the app sends no Google credentials; the device token is the authentication.)
- [ ] **Step 29:** Click **Deploy**.
- [ ] **Step 30:** Click **Authorize access**.
- [ ] **Step 31:** Choose your personal Google account.
- [ ] **Step 32:** At "Google hasn't verified this app", click **Advanced**.
- [ ] **Step 33:** Click **Go to Recipe Genius Private API (unsafe)**. This warning is expected for your own unpublished script.
- [ ] **Step 34:** Confirm the permission screen mentions only **this spreadsheet**, not all of Drive. If it asks for broader access, **stop** — `appsscript.json` did not save; redo Steps 12-15.
- [ ] **Step 35:** Click **Allow**.
- [ ] **Step 36:** Copy the **Web app URL** (it ends in `/exec`).
- [ ] **Step 37:** Save the URL alongside the token. **Do not paste it into the chat, the repo, or any file in the project folder.**
- [ ] **Step 38:** Click **Done**.

**After every future edit to `Code.gs`:** Deploy > **Manage deployments** > pencil icon > Version: **New version** > **Deploy**.

---

### Task 9: Leak guard + live verification

- [ ] **Step 1:** Add a CI guard (`scripts/check-no-secrets.mjs` + test) failing the build if any tracked file contains `script.google.com/macros/s/`. Wire into `test.yml`. A leaked endpoint in git history is permanent.
- [ ] **Step 2:** Run the full suite. Expected: PASS, zero failures.
- [ ] **Step 3:** Pair the laptop. Settings > paste endpoint + token > Pair. Confirm success and "Paired as household".
- [ ] **Step 4:** **Prove the token is enforced.** Unpair, re-pair with a deliberately wrong token, confirm the app says the token was rejected — and confirm in the Apps Script **Executions** dashboard that the run did not touch the spreadsheet.
- [ ] **Step 5:** Write a note. Confirm it appears, then open the private spreadsheet and confirm the row and dated line are there.
- [ ] **Step 6:** Set a rating. Confirm it persists across a reload.
- [ ] **Step 7:** Click "Made it". Confirm `times_cooked` incremented by exactly 1 and `last_cooked` is today.
- [ ] **Step 8:** **Prove idempotency.** Offline, click "Made it" twice on one recipe; go online; let the queue replay; confirm `times_cooked` rose by the correct amount and `OpLog` shows each op once.
- [ ] **Step 9:** **Prove the offline queue.** Offline, write a note; confirm the UI says it will send later and Settings shows a pending count; go online; confirm it sends and the count clears.
- [ ] **Step 10:** **Prove autosave.** Start typing a note, reload mid-typing without saving, confirm the draft is still there.
- [ ] **Step 11:** **Prove the privacy boundary — the most important check.** Open the live site in a private window (unpaired). Confirm all 31 recipes render with no note UI, no ratings, no cooked history, and nothing looking broken. Then check DevTools and confirm no note text exists anywhere in the payload.
- [ ] **Step 12:** **Prove re-pair is recoverable.** Clear site data entirely. Confirm the app opens as the clean public view, Settings shows an obvious re-pair path, and re-pairing brings every note back.
- [ ] **Step 13:** Pair the second phone; confirm a note written on one device appears on the other after a reload.

---

## Self-Review

**Spec coverage:** M6's scope ("Apps Script, device pairing UI with visible state and re-pair, private-layer fetch + offline cache + write queue, notes with local autosave") maps to: the endpoint (Task 1), pairing state and UI with visible state + re-pair (Tasks 2, 5), the client and its capability booleans (Task 3), the queue with replay (Task 4), notes/ratings/history UI (Task 6), offline cache and autosave (Task 7 Steps 2 and 5). Each of the design's security requirements has a home: narrow scope (Task 1 Step 1), token-before-SpreadsheetApp (Task 1 Step 2), URL never committed (Global Constraints + Task 9 Step 1), escaping (inherited — all new markup goes through `html`).

**Placeholder scan:** no TBD/TODO. Tasks 2-6 state their test cases and interfaces precisely but do not inline every implementation line, unlike M1-M5. That is deliberate: those modules are small, their contracts are fully pinned by the enumerated test cases, and the surrounding conventions are now well established in the codebase. Task 1 — the one file that cannot be unit-tested locally and is easiest to get subtly wrong — is the one specified in full.

**Type/name consistency:** `{ok, data, error}` is the single response envelope across Task 1's `json_` and Task 3's client. Action strings `loadPrivate`/`saveNote`/`setRating`/`markCooked` are identical in the `.gs` switch and the JS client. `opId` is the same field name in Task 1's `alreadyApplied_`, Task 4's queue, and Task 7's wiring. `capabilities: {write, private}` matches the shape `static-json-source.js` already returns.

**Deferred by design:** the `Week` tab and `setWeekPlan` are M8 — the endpoint deliberately omits them so M8 adds one action rather than reworking the contract. Cook mode's "Made it? → rate + note in one gesture" is M7; M6 builds the primitives it will call.

**One genuine gap, flagged not dropped:** `scripts/export-private.mjs` — the local backup the design calls for precisely because private data is deliberately excluded from git, and therefore from the free versioned backup every public recipe enjoys. Accumulated cooking notes are the least replaceable data in the system. It is not in this plan; it should be folded into M7 or run as an M6.5 before the notes corpus grows.
