/**
 * SNT FIELD BOARD — Apps Script backend  (v2)
 *
 * v2 changes:
 *  - Reads only TODAY's block of rows, not the whole Log. Constant speed
 *    whether the Log holds 40 rows or 40,000.
 *  - MR master list now lives in a "Master" tab, served to the website.
 *    Add an MR = add a sheet row. No code change, no GitHub push.
 *
 * After pasting: Deploy > Manage deployments > pencil > New version > Deploy
 */

/* ============================================================
   PASTE YOUR SPREADSHEET ID HERE.
   From the SHEET's URL, not the script's:
   docs.google.com/spreadsheets/d/[ THIS LONG STRING ]/edit
   ============================================================ */
var SHEET_ID = '1mZpRIxnLtrwLBfgSthXK12ypamdUrmm7m_YjOKZlILM';

var LOG_SHEET    = 'Log';
var MASTER_SHEET = 'Master';
var TZ = 'Asia/Kolkata';

var HEADERS = ['Timestamp', 'Date', 'Time', 'MR ID', 'MR Name', 'Division',
               'Status', 'Zone', 'City', 'Note'];
var MASTER_HEADERS = ['MR ID', 'MR Name', 'Division', 'Active'];

function getSS_() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet. This script is not bound to a sheet — ' +
                    'put your Spreadsheet ID in SHEET_ID at the top of Code.gs.');
  }
  return ss;
}

function getLog_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function textJson_(str) {
  return ContentService.createTextOutput(str).setMimeType(ContentService.MimeType.JSON);
}
function json_(obj) { return textJson_(JSON.stringify(obj)); }

/* Short-lived server cache. A read costs a full sheet round-trip; caching
   the built response for a few seconds makes repeat polls and extra
   viewers nearly free. Writes clear the day's cache so a new mark shows
   up right away. */
function cacheGet_(k) { try { return CacheService.getScriptCache().get(k); } catch (e) { return null; } }
function cachePut_(k, v, ttl) { try { CacheService.getScriptCache().put(k, v, ttl || 25); } catch (e) {} }
function cacheDel_(k) { try { CacheService.getScriptCache().remove(k); } catch (e) {} }

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function dateStr_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v);
}
function timeStr_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v);
}

/* ============================================================
   ONE ROW PER MR

   The Log holds a single row per MR ID — their current mark. Marking
   again overwrites that same row (date, time, status, zone, town, note),
   so the sheet never grows past your MR count. There is no history: the
   board shows only rows whose Date is today. For a frozen daily record,
   turn on snapshotDaily() (see the bottom of this file).
   ============================================================ */
function findMrRow_(sh, mrId) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 4, last - 1, 1).getValues();   // MR ID column
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(mrId)) return i + 2;  // 1-indexed, skip header
  }
  return 0;
}

/* ---------------- WRITE ---------------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);

    if (!d.mrId || !d.status) return json_({ ok: false, error: 'Missing MR or status' });
    if (d.status === 'WORKING' && (!d.zone || !d.city)) {
      return json_({ ok: false, error: 'Working entries need zone and town' });
    }

    var now  = new Date();
    var date = today_();                 // server decides the date, never the phone
    var time = Utilities.formatDate(now, TZ, 'HH:mm');
    var sh   = getLog_();

    var rowData = [
      now, date, time,
      String(d.mrId), d.mrName || '', d.division || '',
      d.status, d.zone || '', d.city || '',
      String(d.note || '').slice(0, 60)
    ];

    // Find this MR's row and overwrite it; add one if they've never marked.
    var row = findMrRow_(sh, d.mrId);
    var updated = false;
    if (row) {
      var prevDate = dateStr_(sh.getRange(row, 2).getValue());
      updated = (prevDate === date);     // already marked today → this is a change
      sh.getRange(row, 1, 1, HEADERS.length).setValues([rowData]);
    } else {
      sh.appendRow(rowData);
    }

    // A new mark makes the cached board stale — clear today's cache so
    // the next read rebuilds and everyone sees it within one poll.
    cacheDel_('c_full_' + date);
    cacheDel_('c_rows_' + date);

    return json_({ ok: true, time: time, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- MR MASTER ---------------- */
function getMaster_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(MASTER_SHEET);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 4).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][0]).trim();
    var nm = String(vals[i][1]).trim();
    if (!id || !nm) continue;
    var active = String(vals[i][3]).trim().toUpperCase();
    if (active === 'N' || active === 'NO' || active === 'FALSE') continue;
    out.push({ id: id, name: nm, division: String(vals[i][2]).trim() });
  }
  return out;
}

function readRows_(want) {
  var sh = getLog_();
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (dateStr_(r[1]) !== want) continue;   // only rows marked for this date
      rows.push({
        date: dateStr_(r[1]), time: timeStr_(r[2]),
        mrId: String(r[3]), mrName: String(r[4]), division: String(r[5]),
        status: String(r[6]), zone: String(r[7]), city: String(r[8]), note: String(r[9])
      });
    }
  }
  return rows;
}

/* ---------------- READ ----------------
   ?board=1  -> one call returns the MR list AND today's rows, so the
                dashboard needs a single round-trip instead of two.
   ?config=1 -> just the MR list (used by the form).
   otherwise -> today's (or ?date=) rows.                              */
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    if (p.config === '1') {
      var cc = cacheGet_('c_config');
      if (cc) return textJson_(cc);
      var cs = JSON.stringify({ ok: true, mrs: getMaster_() });
      cachePut_('c_config', cs, 60);
      return textJson_(cs);
    }

    var want = p.date || today_();

    if (p.board === '1') {
      var bk = 'c_full_' + want;
      var bc = cacheGet_(bk);
      if (bc) return textJson_(bc);
      var bs = JSON.stringify({ ok: true, date: want, mrs: getMaster_(), rows: readRows_(want) });
      cachePut_(bk, bs, 25);
      return textJson_(bs);
    }

    var rk = 'c_rows_' + want;
    var rc = cacheGet_(rk);
    if (rc) return textJson_(rc);
    var rows = readRows_(want);
    var rs = JSON.stringify({ ok: true, date: want, rows: rows, scanned: rows.length });
    cachePut_(rk, rs, 25);
    return textJson_(rs);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------------- ONE-TIME SETUP ----------------
   Run this once from the editor. Creates the Master tab and seeds it
   with your four trial MRs. Safe to re-run — it will not duplicate.  */
function SETUP_createMasterTab() {
  var ss = getSS_();
  var sh = ss.getSheetByName(MASTER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MASTER_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([MASTER_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.appendRow(['mr01', 'Rohit',    'LCM',      'Y']);
    sh.appendRow(['mr02', 'Sukla ji', 'LCM',      'Y']);
    sh.appendRow(['mr03', 'MR Three', 'Novocamp', 'Y']);
    sh.appendRow(['mr04', 'MR Four',  'Novocamp', 'Y']);
    sh.setColumnWidth(2, 180);
  }
  Logger.log('Master tab ready. Active MRs: ' + getMaster_().length);
  Logger.log(JSON.stringify(getMaster_(), null, 1));
}

/* ---------------- DIAGNOSTICS ---------------- */
function WHERE_IS_MY_DATA() {
  var ss = getSS_();
  Logger.log('Spreadsheet : ' + ss.getName());
  Logger.log('URL         : ' + ss.getUrl());
  Logger.log('Timezone    : ' + ss.getSpreadsheetTimeZone() + '   (must be Asia/Kolkata)');
  Logger.log('Tabs        : ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  Logger.log('Rows in Log : ' + (getLog_().getLastRow() - 1) + ' (excluding header)');
  Logger.log('Active MRs  : ' + getMaster_().length);
}

function TEST_writeRow() {
  var res = doPost({ postData: { contents: JSON.stringify({
    mrId: 'TEST', mrName: 'Test Row', division: 'TEST',
    status: 'WORKING', zone: 'North Gujarat', city: 'Mehsana', note: 'self-test'
  }) } });
  Logger.log('Response: ' + res.getContent());
  Logger.log('Sheet: "' + getSS_().getName() + '"  |  rows now: ' + getLog_().getLastRow());
}

/* Collapse an existing Log to one row per MR (keeping each MR's most
   recent row). Run this ONCE after switching to the one-row-per-MR
   backend to clear out the old append-only history. Safe to re-run. */
function SETUP_collapseToOnePerMR() {
  var sh = getLog_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Log is already empty — nothing to collapse.'); return; }
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var byId = {}, order = [];
  vals.forEach(function (r) {
    var id = String(r[3]);
    if (!id) return;
    if (!(id in byId)) order.push(id);
    byId[id] = r;                       // last row seen per MR wins
  });
  var out = order.map(function (id) { return byId[id]; });
  sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  if (out.length) sh.getRange(2, 1, out.length, HEADERS.length).setValues(out);
  PropertiesService.getScriptProperties().deleteAllProperties();  // drop any old date index
  Logger.log('Collapsed ' + (last - 1) + ' rows to ' + out.length + ' (one per MR).');
}

/* ---------------- OPTIONAL: 11:05 snapshot ----------------
   Add a time-driven trigger at 11:05 IST for a frozen record of the
   board at call time, independent of later corrections.            */
function snapshotDaily() {
  var ss = getSS_();
  var sh = ss.getSheetByName('Snapshots') || ss.insertSheet('Snapshots');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Date', 'Marked at', 'MR ID', 'MR Name', 'Status', 'Zone', 'City']);
    sh.setFrozenRows(1);
  }
  var out = JSON.parse(doGet({ parameter: {} }).getContent());
  var seen = {};
  out.rows.forEach(function (r) { seen[r.mrId] = r; });
  Object.keys(seen).forEach(function (k) {
    var r = seen[k];
    sh.appendRow([r.date, r.time, r.mrId, r.mrName, r.status, r.zone, r.city]);
  });
}
