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
var SHEET_ID = '';

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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function dateStr_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v);
}
function timeStr_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v);
}

/* ============================================================
   THE INDEX — why this stays fast forever

   The Log is append-only and chronological, so every row for a given
   date sits in one unbroken block. We remember the row number where
   each date's block starts. doGet then reads only that block instead
   of the whole sheet. Day 1 and year 5 cost the same.
   ============================================================ */
function startRowFor_(sh, date) {
  var props = PropertiesService.getScriptProperties();
  var key = 'start_' + date;
  var cached = props.getProperty(key);
  if (cached) return Number(cached);

  // Not indexed (old rows, or index cleared) — scan the Date column once,
  // bottom-up, then remember the answer so we never scan again.
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var dates = sh.getRange(2, 2, last - 1, 1).getValues();
  var first = 0;
  for (var i = dates.length - 1; i >= 0; i--) {
    var d = dateStr_(dates[i][0]);
    if (d === date) first = i + 2;      // +2: skip header, 1-indexed rows
    else if (first) break;              // walked past the top of the block
  }
  if (first) props.setProperty(key, String(first));
  return first;
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

    var start = startRowFor_(sh, date);
    var updated = false;
    if (start) {
      var last = sh.getLastRow();
      var ids = sh.getRange(start, 4, last - start + 1, 1).getValues();  // MR ID column only
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(d.mrId)) { updated = true; break; }
      }
    }

    sh.appendRow([
      now, date, time,
      d.mrId, d.mrName || '', d.division || '',
      d.status, d.zone || '', d.city || '',
      String(d.note || '').slice(0, 60)
    ]);

    // First row of a new day? Record where the block starts.
    if (!start) {
      PropertiesService.getScriptProperties().setProperty('start_' + date, String(sh.getLastRow()));
    }

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

/* ---------------- READ ---------------- */
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    if (p.config === '1') {
      return json_({ ok: true, mrs: getMaster_() });
    }

    var want = p.date || today_();
    var sh = getLog_();
    var start = startRowFor_(sh, want);
    var rows = [];

    if (start) {
      var last = sh.getLastRow();
      var vals = sh.getRange(start, 1, last - start + 1, HEADERS.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        var r = vals[i];
        if (dateStr_(r[1]) !== want) continue;   // guard against a stale index
        rows.push({
          date: dateStr_(r[1]), time: timeStr_(r[2]),
          mrId: String(r[3]), mrName: String(r[4]), division: String(r[5]),
          status: String(r[6]), zone: String(r[7]), city: String(r[8]), note: String(r[9])
        });
      }
    }
    return json_({ ok: true, date: want, rows: rows, scanned: rows.length });
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

/* Rebuild the date index from scratch. Run this ONLY if you have
   sorted, deleted, or inserted rows in Log and the board looks wrong. */
function FIX_rebuildIndex() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('Index cleared. It rebuilds itself on the next read — nothing else to do.');
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
