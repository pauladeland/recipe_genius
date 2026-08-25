/**
 * Recipe Genius -- private-layer write endpoint.
 *
 * Container-bound to the PRIVATE spreadsheet. Deployed "execute as me /
 * anyone", which means this URL is a public write endpoint acting with the
 * owner's Google identity. Two things contain that:
 *
 *   1. The oauthScopes in appsscript.json restrict this script to THIS
 *      spreadsheet only (spreadsheets.currentonly). It cannot reach Drive or
 *      any other file, even though it runs as the owner. This is the real
 *      boundary -- everything else is defence in depth.
 *   2. checkToken runs before any SpreadsheetApp call, so an unauthorized
 *      request burns as little of the account-wide quota as possible.
 *
 * The repo (apps-script/Code.gs) is the source of truth for this file. If you
 * edit it in the Apps Script editor, copy it back. And remember Apps Script
 * serves the last DEPLOYED version, not the last saved one -- after any edit,
 * Deploy > Manage deployments > pencil > New version > Deploy.
 */

/**
 * Set once in Project Settings > Script Properties, key DEVICE_TOKEN.
 * NEVER hardcode it here -- this file lives in a public repo.
 */
function getExpectedToken_() {
  return PropertiesService.getScriptProperties().getProperty('DEVICE_TOKEN');
}

/**
 * Length-independent comparison. Timing attacks over HTTPS against Apps
 * Script are not a realistic threat at this stakes level, but doing it
 * properly costs four lines.
 */
function tokensMatch_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * A GET must never return data. Someone who finds the URL and pastes it into
 * a browser bar gets a flat wall, not a listing of the household's notes.
 */
function doGet() {
  return json_({ ok: false, error: 'unsupported' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  // A body of literal `null`, or a non-string token such as {"length":5},
  // would otherwise throw below and hand back Apps Script's HTML error page --
  // which the client then misdiagnoses to the user as a deployment-access
  // problem, sending them to the wrong setting entirely.
  if (!body || typeof body !== 'object' || typeof body.token !== 'string') {
    return json_({ ok: false, error: 'bad_request' });
  }

  // Token check BEFORE any SpreadsheetApp access. Do not move this.
  if (!tokensMatch_(body.token, getExpectedToken_())) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  // Reads need no lock.
  if (body.action === 'loadPrivate') {
    try {
      return json_({ ok: true, data: loadPrivate_() });
    } catch (err) {
      return json_({ ok: false, error: String((err && err.message) || err) });
    }
  }

  // Every MUTATION serialises. Apps Script does not serialise doPost, and the
  // client can genuinely send the same opId twice at once: an op stays in the
  // write queue for the whole in-flight window, and a connectivity flap fires
  // the 'online' handler, which replays it. Without this lock both executions
  // reach alreadyApplied_ before either reaches recordOp_, both see false, and
  // one tap of "Made it" increments times_cooked twice -- exactly the silent
  // corruption opIds exist to prevent. It also makes markCooked_'s
  // read-then-write increment safe against lost updates.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    // Could not get the lock in time. Reported as a failure so the client
    // keeps the op queued and retries, rather than dropping the write.
    return json_({ ok: false, error: 'busy' });
  }

  try {
    switch (body.action) {
      case 'saveNote':   return json_({ ok: true, data: saveNote_(body) });
      case 'setRating':  return json_({ ok: true, data: setRating_(body) });
      case 'markCooked': return json_({ ok: true, data: markCooked_(body) });
      default:           return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

var PRIVATE_HEADERS = ['recipe_id', 'user_id', 'last_cooked', 'times_cooked', 'rating', 'notes'];
var OPLOG_HEADERS = ['op_id', 'applied_at', 'action'];
var USER_ID = 'household';

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

/** Header-name lookup, never fixed indexes -- columns get reordered by hand. */
function colIndex_(sh, name) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === name) return i + 1;
  }
  throw new Error('Missing column "' + name + '" in sheet "' + sh.getName() + '"');
}

function findRow_(sh, recipeId) {
  var idCol = colIndex_(sh, 'recipe_id');
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === recipeId) return i + 2;
  }
  return 0;
}

function ensureRow_(sh, recipeId) {
  var row = findRow_(sh, recipeId);
  if (row) return row;
  sh.appendRow([recipeId, USER_ID, '', 0, '', '']);
  return sh.getLastRow();
}

/**
 * Idempotency. The client queues writes while offline and replays them on
 * reconnect, so the same op can legitimately arrive twice. Without this a
 * replayed markCooked silently double-counts times_cooked -- corruption you
 * would not notice until the variety features in M11 read it back.
 */
function alreadyApplied_(opId) {
  if (!opId) return false;
  var sh = sheet_('OpLog', OPLOG_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, colIndex_(sh, 'op_id'), last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === opId) return true;
  }
  return false;
}

function recordOp_(opId, action) {
  if (!opId) return;
  sheet_('OpLog', OPLOG_HEADERS).appendRow([opId, new Date().toISOString(), action]);
}

function asDateString_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function loadPrivate_() {
  var sh = sheet_('Private', PRIVATE_HEADERS);
  var last = sh.getLastRow();
  var byRecipe = {};
  if (last >= 2) {
    var width = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) {
      return String(h).trim();
    });
    var rows = sh.getRange(2, 1, last - 1, width).getValues();
    rows.forEach(function (row) {
      var rec = {};
      headers.forEach(function (h, i) { rec[h] = row[i]; });
      if (!rec.recipe_id) return;
      byRecipe[String(rec.recipe_id).trim()] = {
        // Sheets parses 'YYYY-MM-DD' on write and hands back a Date on read,
        // so String() would render "Tue Aug 25 2026 00:00:00 GMT-0400..."
        // straight into the UI. Format it back to the shape we stored.
        lastCooked: asDateString_(rec.last_cooked),
        timesCooked: Number(rec.times_cooked) || 0,
        rating: (rec.rating === '' || rec.rating == null) ? null : Number(rec.rating),
        notes: rec.notes ? String(rec.notes) : ''
      };
    });
  }
  return { byRecipe: byRecipe, fetchedAt: new Date().toISOString() };
}

function saveNote_(body) {
  if (!body.recipeId || !body.text) throw new Error('recipeId and text are required');
  if (alreadyApplied_(body.opId)) return loadPrivate_();
  var sh = sheet_('Private', PRIVATE_HEADERS);
  var row = ensureRow_(sh, body.recipeId);
  var cell = sh.getRange(row, colIndex_(sh, 'notes'));
  var existing = String(cell.getValue() || '');
  // Append-only and dated. A real newline from a JS string literal -- never a
  // placeholder token that has to be find-and-replaced later (the M0 lesson).
  var entry = today_() + ' - ' + String(body.text).trim();
  cell.setValue(existing ? existing + '\n' + entry : entry);
  recordOp_(body.opId, 'saveNote');
  return loadPrivate_();
}

function setRating_(body) {
  var rating = Number(body.rating);
  if (!(rating >= 1 && rating <= 5)) throw new Error('rating must be 1-5');
  if (!body.recipeId) throw new Error('recipeId is required');
  if (alreadyApplied_(body.opId)) return loadPrivate_();
  var sh = sheet_('Private', PRIVATE_HEADERS);
  var row = ensureRow_(sh, body.recipeId);
  sh.getRange(row, colIndex_(sh, 'rating')).setValue(rating);
  recordOp_(body.opId, 'setRating');
  return loadPrivate_();
}

function markCooked_(body) {
  if (!body.recipeId) throw new Error('recipeId is required');
  if (alreadyApplied_(body.opId)) return loadPrivate_();
  var sh = sheet_('Private', PRIVATE_HEADERS);
  var row = ensureRow_(sh, body.recipeId);
  var timesCol = colIndex_(sh, 'times_cooked');
  var current = Number(sh.getRange(row, timesCol).getValue()) || 0;
  sh.getRange(row, timesCol).setValue(current + 1);
  // Always the server's date. A client-supplied one was an unused parameter
  // and a needless write surface on the trust boundary.
  sh.getRange(row, colIndex_(sh, 'last_cooked')).setValue(today_());
  recordOp_(body.opId, 'markCooked');
  return loadPrivate_();
}
