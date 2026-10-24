# Email capture (Google Apps Script)

Used by the email gate on the results download. The gate stays off until `SIGNUP_URL` in `app.js` is set.

1. Create a Google Sheet. Optional: add headers in row 1 (Time, Email, Name, Company, Consent, Source).
2. Open the sheet, then Extensions, then Apps Script.
3. Paste the contents of `signup.gs` and save.
4. Click Deploy, then New deployment, then choose Web app.
5. Set Execute as: Me. Set Who has access: Anyone.
6. Click Deploy and authorise when asked.
7. Copy the Web app URL and set it as `SIGNUP_URL` in `app.js`.

The script stores only the email, optional name and company, consent and source. It never receives audit results.
