// Workflow audit: email capture. Deploy as a Google Apps Script web app (see README.md).
// Receives { email, name, company, consent, source } and appends one row to the first sheet.
// It never receives audit results. No secrets live in this file.

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput("ignored");
  }
  if (!d || typeof d !== "object") return ContentService.createTextOutput("ignored");

  var email = clean(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ContentService.createTextOutput("ignored");

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  sheet.appendRow([new Date(), email, clean(d.name), clean(d.company), d.consent === true ? "yes" : "no", clean(d.source)]);
  return ContentService.createTextOutput("ok");
}

// text, trimmed, max 200 chars, and neutralised against spreadsheet formula injection
function clean(v) {
  var s = String(v == null ? "" : v).trim().slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
