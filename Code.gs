/**
 * SNT FIELD BOARD — Apps Script backend
 * Bind this to a Google Sheet (Extensions ▸ Apps Script).
 * Sheet timezone MUST be Asia/Kolkata (File ▸ Settings ▸ Time zone).
 *
 * Deploy ▸ New deployment ▸ Web app
 *   Execute as:      Me
 *   Who has access:  Anyone
 * Copy the /exec URL into data.js → API_URL
 */

var LOG_SHEET = 'Log';
var HEADERS = ['Timestamp', 'Date', 'Time', 'MR ID', 'MR Name', 'Division',
               'Status', 'Zone', 'City', 'Note'];

function getLog_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
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

    var now = new Date();
    var date = today_();                       // server decides the date, not the phone
    var time = Utilities.formatDate(now, 'Asia/Kolkata', 'HH:mm');

    var sh = getLog_();
    // Was this MR already logged today? (for the "updated" flag only — we append regardless)
    var updated = false;
    var last = sh.getLastRow();
    if (last > 1) {
      var vals = sh.getRange(2, 2, last - 1, 3).getValues(); // Date, Time, MR ID
      for (var i = 0; i < vals.length; i++) {
        var rowDate = vals[i][0] instanceof Date
          ? Utilities.formatDate(vals[i][0], 'Asia/Kolkata', 'yyyy-MM-dd')
          : String(vals[i][0]);
        if (rowDate === date && String(vals[i][2]) === String(d.mrId)) { updated = true; break; }
      }
    }

    sh.appendRow([
      now, date, time,
      d.mrId, d.mrName || '', d.division || '',
      d.status, d.zone || '', d.city || '',
      String(d.note || '').slice(0, 60)
    ]);

    return json_({ ok: true, time: time, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ---------------- READ ---------------- */
function doGet(e) {
  try {
    var want = (e && e.parameter && e.parameter.date) ? e.parameter.date : today_();
    var sh = getLog_();
    var last = sh.getLastRow();
    var rows = [];

    if (last > 1) {
      var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        var r = vals[i];
        var rowDate = r[1] instanceof Date
          ? Utilities.formatDate(r[1], 'Asia/Kolkata', 'yyyy-MM-dd')
          : String(r[1]);
        if (rowDate !== want) continue;
        rows.push({
          date: rowDate,
          time: r[2] instanceof Date ? Utilities.formatDate(r[2], 'Asia/Kolkata', 'HH:mm') : String(r[2]),
          mrId: String(r[3]),
          mrName: String(r[4]),
          division: String(r[5]),
          status: String(r[6]),
          zone: String(r[7]),
          city: String(r[8]),
          note: String(r[9])
        });
      }
    }
    // chronological — the dashboard keeps the last row per MR
    return json_({ ok: true, date: want, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------------- OPTIONAL: daily archive of the board ----------------
   Set a time-driven trigger at 11:05 IST if you want a permanent
   snapshot of who was where, independent of the Log.                  */
function snapshotDaily() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Snapshots') || ss.insertSheet('Snapshots');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Date', 'Marked at 11:05', 'MR ID', 'MR Name', 'Status', 'Zone', 'City']);
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
