// Workflow audit: email capture. Deploy as a Google Apps Script web app (see README.md).
// Receives { email, name, company, consent, source } and appends one row to the first sheet.
// One row per email: a repeat email is ignored and returns "duplicate".
// It never receives audit results. No secrets live in this file.

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput("ignored");
  }
  if (!d || typeof d !== "object") return ContentService.createTextOutput("ignored");

  var email = String(d.email == null ? "" : d.email).trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ContentService.createTextOutput("ignored");

  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // so two simultaneous posts cannot both append
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var last = sheet.getLastRow();
    if (last >= 2) { // row 1 is the header row
      var existing = sheet.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (key(existing[i][0]) === email) return ContentService.createTextOutput("duplicate");
      }
    }
    sheet.appendRow([new Date(), clean(email), clean(d.name), clean(d.company), d.consent === true ? "yes" : "no", clean(d.source)]);
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}

// comparison form of a stored email: trimmed, lower case, without the formula-guard apostrophe
function key(v) {
  return String(v == null ? "" : v).trim().toLowerCase().replace(/^'/, "");
}

// text, trimmed, max 200 chars, and neutralised against spreadsheet formula injection
function clean(v) {
  var s = String(v == null ? "" : v).trim().slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
