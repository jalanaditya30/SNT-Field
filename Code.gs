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

/* The MR roster. Edit here and run SETUP_resetMasterTab() to apply, or
   just edit the Master tab directly (add a row / set Active to N). */
var MR_SEED = [
  ['mr01', 'Rohit',      'Alkem - Novokem',    'Y'],
  ['mr02', 'Hiten',      'Alkem - Novokem',    'Y'],
  ['mr03', 'Jayesh',     'Alkem - Novokem',    'Y'],
  ['mr04', 'Krishna',    'Alkem - Novokem',    'Y'],
  ['mr05', 'Pawan',      'Alkem - Novokem',    'Y'],
  ['mr06', 'Siddharth',  'Alkem - Novokem',    'Y'],
  ['mr07', 'Bhavik',     'Alkem - Novokem',    'Y'],
  ['mr08', 'Shukla',     'Alkem - Maxxio',     'Y'],
  ['mr09', 'Mandip',     'Alkem - Maxxio',     'Y'],
  ['mr10', 'Shiv Tiwari','Alkem - Healthcare', 'Y'],
  ['mr11', 'Siddharth',  'Ranbaxy',            'Y'],
  ['mr12', 'Rahul',      'Ranbaxy',            'Y'],
  ['mr13', 'Vishal',     'Ranbaxy',            'Y'],
  ['mr14', 'Nilesh',     'Ranbaxy',            'Y'],
  ['mr15', 'Vinayak',    'Lupin',              'Y'],
  ['mr16', 'Haresh',     'Lupin',              'Y'],
  ['mr17', 'Sanjay',     'Torque',             'Y'],
  ['mr18', 'Jagdish',    'Torque',             'Y']
];

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
   ONE ROW PER MR PER DAY

   Each MR gets one row per day. Marking again the same day overwrites
   that day's row (time, status, zone, towns, note); a new day starts a
   new row. So the board shows today, and past days stay on the sheet as
   history — one row per MR per day.
   ============================================================ */
function findMrRow_(sh, mrId, date) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 2, last - 1, 3).getValues();   // Date, Time, MR ID
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][2]) === String(mrId) && dateStr_(vals[i][0]) === date) {
      return i + 2;                                         // 1-indexed, skip header
    }
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

    // Overwrite this MR's row for today, or add one if they haven't
    // marked today yet (a new day always starts a fresh row).
    var row = findMrRow_(sh, d.mrId, date);
    var updated = !!row;                  // already marked today → this is a change
    if (row) {
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
    sh.getRange(2, 1, MR_SEED.length, 4).setValues(MR_SEED);
    sh.setColumnWidth(2, 180);
  }
  Logger.log('Master tab ready. Active MRs: ' + getMaster_().length);
  Logger.log(JSON.stringify(getMaster_(), null, 1));
}

/* Replace the whole Master tab with MR_SEED above — removes the old MRs
   and writes the current roster. Run this once after editing MR_SEED. */
function SETUP_resetMasterTab() {
  var ss = getSS_();
  var sh = ss.getSheetByName(MASTER_SHEET) || ss.insertSheet(MASTER_SHEET);
  var last = sh.getLastRow();
  if (last >= 1) sh.getRange(1, 1, last, 4).clearContent();
  sh.getRange(1, 1, 1, 4).setValues([MASTER_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, MR_SEED.length, 4).setValues(MR_SEED);
  sh.setColumnWidth(2, 180);
  cacheDel_('c_config');   // so the new list shows on the next load
  Logger.log('Master reset. Active MRs: ' + getMaster_().length);
}

/* Wipe all mark rows from Log (keeps the header). Use when starting
   fresh — e.g. after swapping the MR roster — so no stale rows linger. */
function SETUP_clearLog() {
  var sh = getLog_();
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  CacheService.getScriptCache().removeAll(['c_full_' + today_(), 'c_rows_' + today_()]);
  Logger.log('Log cleared. Rows now: ' + (getLog_().getLastRow() - 1));
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

/* Collapse an existing append-only Log to one row per MR per day
   (keeping each MR's latest row for each date). Run once when migrating
   old data. Safe to re-run. */
function SETUP_collapseToOnePerMrPerDay() {
  var sh = getLog_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Log is already empty — nothing to collapse.'); return; }
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var byKey = {}, order = [];
  vals.forEach(function (r) {
    var id = String(r[3]);
    if (!id) return;
    var key = id + '|' + dateStr_(r[1]);   // one row per MR per date
    if (!(key in byKey)) order.push(key);
    byKey[key] = r;                        // last row seen for that MR+date wins
  });
  var out = order.map(function (k) { return byKey[k]; });
  sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  if (out.length) sh.getRange(2, 1, out.length, HEADERS.length).setValues(out);
  PropertiesService.getScriptProperties().deleteAllProperties();  // drop any old date index
  Logger.log('Collapsed ' + (last - 1) + ' rows to ' + out.length + ' (one per MR per day).');
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
