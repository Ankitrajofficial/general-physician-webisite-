/**
 * Appointment booking → email + PDF receipt (Google Apps Script web app)
 *
 * On each booking from the website form this:
 *   1. Generates a unique booking code.
 *   2. Builds a clinical PDF receipt (clinic branding, code, fee, payment note).
 *   3. Emails the CLINIC a notification with the receipt attached.
 *   4. Emails the PATIENT a confirmation with the same receipt attached
 *      (only when the patient provided an email address).
 *
 * Deploy as a Web App (see SETUP.md). Set the CONFIG values below first.
 */

/* ------------------------------- CONFIG ---------------------------------- */
// Where booking notifications are sent (the clinic's inbox).
const RECIPIENT_EMAIL = "clinic-email@example.com";

// Clinic identity, shown on emails and the receipt.
const CLINIC_NAME = "Dr Ajit Kishor Clinic";
const CLINIC_TAGLINE = "Primary care and general medicine";
const CLINIC_ADDRESS = "Monika Niwaas, opposite Patna College, near Razza High School, Annie Besant Road, Patna 800004, Bihar";
const CLINIC_PHONE = "062055 93020";
const CLINIC_HOURS = "Mon - Sat, 9:00 AM - 9:00 PM";
const CONSULTATION_FEE = "INR 300";

// Doctor identity, shown on the consultation sheet PDF.
const DOCTOR_NAME = "Dr Ajit Kishor";
const DOCTOR_QUALIFICATION = "MD (PMCH) - Consultant Physician";
const DOCTOR_REG_NO = ""; // optional medical registration number (blank = hidden)

// Prefix for the booking code (e.g. DAK-20260606-4821).
const CODE_PREFIX = "DAK";

// Optional: log every booking to a Google Sheet. Paste the Sheet ID from its
// URL — the part between /d/ and /edit:
//   https://docs.google.com/spreadsheets/d/THIS_PART/edit
// Leave "" to skip sheet logging (emails still work).
const SHEET_ID = "";

// Add each booking to Google Calendar. The event is created on the clinic's
// calendar, and the patient is added as a guest so Google emails them an
// invite (which lands on THEIR calendar when accepted).
const ADD_TO_CALENDAR = true;
// "" = the clinic account's default calendar. To use a specific calendar,
// open Google Calendar ▸ that calendar's Settings ▸ "Integrate calendar" ▸
// copy the Calendar ID and paste it here.
const CALENDAR_ID = "";
// How long each appointment block is, in minutes.
const APPOINTMENT_DURATION_MIN = 30;
/* ------------------------------------------------------------------------- */

function doPost(e) {
  try {
    const data = e && e.postData ? JSON.parse(e.postData.contents) : {};

    const fields = {
      name: clean(data.patientName, "Unknown"),
      phone: clean(data.phone, "Not provided"),
      email: String(data.email || "").trim(),
      patientType: clean(data.patientType, "Not provided"),
      reason: clean(data.reason, "Not provided"),
      date: clean(data.date, "Not provided"),
      time: clean(data.time, "Not provided"),
      message: String(data.message || "").trim(),
    };

    const bookingCode = makeBookingCode();
    const issuedOn = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "dd MMM yyyy, hh:mm a"
    );

    const hasEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email);

    // Clinical PDF receipt, attached to both emails.
    const receipt = buildReceiptPdf(fields, bookingCode, issuedOn);

    // 1) Clinic notification.
    MailApp.sendEmail(RECIPIENT_EMAIL, "New appointment request - " + fields.name + " (" + bookingCode + ")", clinicPlain(fields, bookingCode), {
      name: CLINIC_NAME,
      htmlBody: clinicHtml(fields, bookingCode),
      replyTo: hasEmail ? fields.email : undefined,
      attachments: [receipt],
    });

    // 2) Patient confirmation (only if an email was provided).
    if (hasEmail) {
      MailApp.sendEmail(fields.email, "Your appointment request with " + CLINIC_NAME + " (" + bookingCode + ")", patientPlain(fields, bookingCode), {
        name: CLINIC_NAME,
        htmlBody: patientHtml(fields, bookingCode),
        replyTo: RECIPIENT_EMAIL,
        attachments: [receipt],
      });
    }

    // 3) Log to the Google Sheet (never let a sheet error block the booking).
    try {
      logToSheet(fields, bookingCode, issuedOn);
    } catch (sheetErr) {
      // ignore; emails already sent
    }

    // 4) Add to the clinic calendar + invite the patient (never block booking).
    try {
      createCalendarEvent_(fields, bookingCode);
    } catch (calErr) {
      // ignore; emails already sent
    }

    return json({ ok: true, bookingCode: bookingCode });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function logToSheet(f, code, issuedOn) {
  if (!SHEET_ID) return;
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp", "Booking code", "Name", "Phone", "Email",
      "Patient type", "Reason", "Preferred date", "Preferred time",
      "Scheduling note", "Reminder sent",
    ]);
  }
  sheet.appendRow([
    issuedOn, code, f.name, f.phone, f.email,
    f.patientType, f.reason, f.date, f.time, f.message,
  ]);
}

function doGet() {
  return json({ ok: true, service: "appointment-notifier" });
}

/* ----------------------------- calendar ----------------------------------- */
/**
 * Turns the preferred date + time slot into concrete start/end times.
 * Morning -> 09:00, Afternoon -> 12:00, Evening -> 16:00, anything else -> 09:00.
 * Returns null if the date can't be parsed.
 */
function buildEventTimes_(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return null;
  const t = String(timeStr).toLowerCase();
  let hour = 9;
  if (t.indexOf("afternoon") >= 0) hour = 12;
  else if (t.indexOf("evening") >= 0) hour = 16;
  else hour = 9; // morning / first available / default
  const start = new Date(+m[1], +m[2] - 1, +m[3], hour, 0, 0);
  const end = new Date(start.getTime() + APPOINTMENT_DURATION_MIN * 60000);
  return { start: start, end: end };
}

/** Creates the calendar event and invites the patient (if they gave an email). */
function createCalendarEvent_(f, code) {
  if (!ADD_TO_CALENDAR) return;
  const times = buildEventTimes_(f.date, f.time);
  if (!times) return;

  const cal = CALENDAR_ID
    ? CalendarApp.getCalendarById(CALENDAR_ID)
    : CalendarApp.getDefaultCalendar();
  if (!cal) return;

  const title = "Appointment: " + f.name + " (" + code + ")";
  const desc = [
    "Booking code: " + code,
    "Name: " + f.name,
    "Phone: " + f.phone,
    "Reason: " + f.reason,
    "Patient type: " + f.patientType,
    "Preferred time: " + f.time,
    "Note: " + (f.message || "(none)"),
    "Fee: " + CONSULTATION_FEE,
  ].join("\n");

  const options = { description: desc, location: CLINIC_ADDRESS };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    options.guests = f.email;     // patient gets a calendar invite by email
    options.sendInvites = true;
  }
  cal.createEvent(title, times.start, times.end, options);
}

/** Google Calendar "add event" link the patient can tap from the email. */
function googleCalUrl_(f) {
  const times = buildEventTimes_(f.date, f.time);
  if (!times) return "";
  const fmt = function (d) {
    return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'");
  };
  const details =
    "Reason: " + f.reason + "\n" +
    "Name: " + f.name + "\n" +
    "Phone: " + f.phone + "\n" +
    "Fee: " + CONSULTATION_FEE + "\n" +
    "Please confirm your slot with the clinic.";
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Appointment - " + CLINIC_NAME) +
    "&dates=" + fmt(times.start) + "/" + fmt(times.end) +
    "&details=" + encodeURIComponent(details) +
    "&location=" + encodeURIComponent(CLINIC_ADDRESS)
  );
}

/* ----------------------- scheduled (cron) jobs ---------------------------- */
// Column positions (1-based) in the bookings sheet.
const COL = {
  timestamp: 1, code: 2, name: 3, phone: 4, email: 5,
  patientType: 6, reason: 7, date: 8, time: 9, message: 10, reminded: 11,
};

/**
 * Run once from the editor (Run ▸ setupTriggers) to install both schedules.
 * Summary every morning ~8 AM, reminders every evening ~6 PM.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === "sendDailySummary" || fn === "sendDayBeforeReminders") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("sendDailySummary").timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger("sendDayBeforeReminders").timeBased().everyDays(1).atHour(18).create();
}

/** Morning digest: emails the clinic a PDF of all bookings in the sheet. */
function sendDailySummary() {
  const sheet = getBookingSheet_();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMM yyyy");
  const last = sheet.getLastRow();

  if (last < 2) {
    MailApp.sendEmail(RECIPIENT_EMAIL, "Daily booking summary (" + today + ") - no bookings", "No bookings recorded yet.", { name: CLINIC_NAME });
    return;
  }

  const rows = sheet.getRange(2, 1, last - 1, 10).getValues();
  const pdf = buildBookingsPdf(rows, today);
  MailApp.sendEmail(
    RECIPIENT_EMAIL,
    "Daily booking summary (" + today + ") - " + rows.length + " booking(s)",
    "Attached: PDF of all " + rows.length + " booking(s) as of " + today + ".",
    { name: CLINIC_NAME, attachments: [pdf] }
  );
}

/** Emails a reminder to every patient whose preferred date is tomorrow. */
function sendDayBeforeReminders() {
  const sheet = getBookingSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return;

  const tz = Session.getScriptTimeZone();
  const tomorrow = Utilities.formatDate(addDays_(new Date(), 1), tz, "yyyy-MM-dd");
  const rows = sheet.getRange(2, 1, last - 1, 11).getValues();

  for (var i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = String(r[COL.email - 1] || "").trim();
    const already = String(r[COL.reminded - 1] || "").trim();
    const prefDate = normalizeDate_(r[COL.date - 1]);

    if (prefDate === tomorrow && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !already) {
      sendReminderEmail_(r, email);
      sheet.getRange(i + 2, COL.reminded).setValue("Sent " + Utilities.formatDate(new Date(), tz, "dd MMM HH:mm"));
    }
  }
}

function sendReminderEmail_(r, email) {
  const name = r[COL.name - 1];
  const code = r[COL.code - 1];
  const date = normalizeDate_(r[COL.date - 1]);
  const time = r[COL.time - 1];
  const reason = r[COL.reason - 1];

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#17212b;">' +
    '<h2 style="margin:0 0 8px;color:#7d5a1f;">Appointment reminder</h2>' +
    '<p style="margin:0 0 14px;color:#2e3c46;">Hi ' + esc(name) + ', this is a reminder for your appointment <strong>tomorrow</strong> at ' + esc(CLINIC_NAME) + '.</p>' +
    '<table style="border-collapse:collapse;font-size:14px;">' +
    '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;">Booking code</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(code) + '</td></tr>' +
    '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;">Date</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(date) + '</td></tr>' +
    '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;">Time</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(time) + '</td></tr>' +
    '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;">Reason</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(reason) + '</td></tr>' +
    '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;">Fee</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(CONSULTATION_FEE) + '</td></tr>' +
    '</table>' +
    '<p style="margin:16px 0 0;padding:13px 15px;background:#fff2e2;border:1px solid #f1c797;color:#71351f;font-size:13px;">Please carry cash or be ready to pay online (UPI / card), and show your booking code at the reception.</p>' +
    '</div>';

  MailApp.sendEmail(email, "Reminder: your appointment tomorrow (" + code + ")",
    "Hi " + name + ", reminder for your appointment tomorrow (" + date + ", " + time + ") at " + CLINIC_NAME +
    ". Booking code: " + code + ". Fee: " + CONSULTATION_FEE + ". Please carry cash or pay online at the clinic.",
    { name: CLINIC_NAME, htmlBody: html, replyTo: RECIPIENT_EMAIL });
}

function buildBookingsPdf(rows, dateLabel) {
  const head =
    '<tr>' +
    ["Code", "Name", "Phone", "Date", "Time", "Reason", "Received"].map(function (h) {
      return '<th style="padding:8px 10px;border:1px solid #d8c389;background:#7d5a1f;color:#fff;text-align:left;font-size:11px;">' + esc(h) + '</th>';
    }).join("") +
    '</tr>';

  const body = rows.map(function (r) {
    // r: [timestamp, code, name, phone, email, type, reason, date, time]
    const cells = [r[1], r[2], r[3], normalizeDate_(r[7]), r[8], r[6], r[0]];
    return '<tr>' + cells.map(function (c) {
      return '<td style="padding:7px 10px;border:1px solid #dce4ea;font-size:11px;">' + esc(c) + '</td>';
    }).join("") + '</tr>';
  }).join("");

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#17212b;"><div style="padding:28px;">' +
    '<div style="font-size:20px;font-weight:bold;color:#7d5a1f;">' + esc(CLINIC_NAME) + '</div>' +
    '<div style="font-size:13px;color:#63727e;margin:2px 0 16px;">Bookings summary &middot; ' + esc(dateLabel) + ' &middot; ' + rows.length + ' total</div>' +
    '<table style="border-collapse:collapse;width:100%;">' + head + body + '</table>' +
    '</div></body></html>';

  const fileName = "Bookings-" + dateLabel.replace(/ /g, "-") + ".pdf";
  return Utilities.newBlob(html, MimeType.HTML, fileName).getAs(MimeType.PDF).setName(fileName);
}

function getBookingSheet_() {
  if (!SHEET_ID) throw new Error("SHEET_ID is not set - the scheduled jobs need the bookings sheet.");
  return SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
}

function addDays_(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function normalizeDate_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(v).trim().slice(0, 10);
}

/* ---------------------------- booking code -------------------------------- */
function makeBookingCode() {
  const ymd = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return CODE_PREFIX + "-" + ymd + "-" + rand;
}

/* ------------------------------ PDF receipt ------------------------------- */
function buildReceiptPdf(f, code, issuedOn) {
  const html = sheetHtml(f, code, issuedOn);
  const fileName = "Consultation-Sheet-" + code + ".pdf";
  return Utilities.newBlob(html, MimeType.HTML, fileName)
    .getAs(MimeType.PDF)
    .setName(fileName);
}

/** Repeated faint ruled lines that make blank areas look like a prescription pad. */
function ruledLines_(count, height) {
  var line = '<div style="height:' + height + 'px;border-bottom:1px solid #ecdcb1;"></div>';
  var out = '';
  for (var i = 0; i < count; i++) out += line;
  return out;
}

/** One labelled vitals box (e.g. "BP" with a blank line beneath). */
function vitalCell_(label, unit, last) {
  var border = last ? '' : 'border-right:1px solid #ecdcb1;';
  return (
    '<td style="width:16.66%;padding:5px 9px;' + border + 'vertical-align:top;">' +
    '<div style="font-size:9px;font-weight:bold;letter-spacing:0.6px;color:#946d22;text-transform:uppercase;">' + esc(label) + '</div>' +
    '<div style="height:13px;border-bottom:1px solid #d8c389;margin-top:5px;"></div>' +
    '<div style="font-size:8px;color:#a3987f;margin-top:2px;">' + esc(unit) + '</div>' +
    '</td>'
  );
}

/**
 * Builds the consultation sheet. Tuned to fit a SINGLE A4 page: the @page rule
 * sets A4 with tight margins, and every vertical gap is sized so the total
 * content height stays under one page in the Apps Script HTML->PDF converter.
 */
function sheetHtml(f, code, issuedOn) {
  const initials = monogram_(DOCTOR_NAME);
  const regLine = DOCTOR_REG_NO
    ? '<div style="font-size:11px;color:#f0e2bb;margin-top:2px;">Reg. No: ' + esc(DOCTOR_REG_NO) + '</div>'
    : '';

  const blockTitle = 'font-size:11px;font-weight:bold;color:#946d22;letter-spacing:1px;text-transform:uppercase;';

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    '@page { size: A4; margin: 10mm 9mm; }' +
    'html, body { margin: 0; padding: 0; }' +
    '* { box-sizing: border-box; }' +
    'table { page-break-inside: avoid; }' +
    '</style></head>' +
    '<body style="font-family:Arial,Helvetica,sans-serif;color:#2c2415;">' +

    // Gold accent strip at the very top.
    '<div style="height:6px;background:#b88a32;"></div>' +

    // ---------------- LETTERHEAD ----------------
    '<table width="100%" style="border-collapse:collapse;background:#7d5a1f;color:#ffffff;"><tr>' +
    '<td style="padding:15px 22px;vertical-align:middle;">' +
    '<table style="border-collapse:collapse;"><tr>' +
    '<td style="vertical-align:middle;padding-right:14px;">' +
    '<div style="width:54px;height:54px;border-radius:50%;background:#ffffff;color:#7d5a1f;font-family:Georgia,serif;font-size:23px;font-weight:bold;text-align:center;line-height:54px;border:2px solid #f4c66b;">' + esc(initials) + '</div>' +
    '</td>' +
    '<td style="vertical-align:middle;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:23px;font-weight:bold;letter-spacing:0.3px;">' + esc(DOCTOR_NAME) + '</div>' +
    '<div style="font-size:11px;color:#f3e6c2;margin-top:2px;">' + esc(DOCTOR_QUALIFICATION) + '</div>' +
    regLine +
    '</td>' +
    '</tr></table>' +
    '</td>' +
    '<td style="padding:15px 22px;text-align:right;vertical-align:middle;font-size:10px;color:#f0e2bb;line-height:1.55;">' +
    '<div style="font-size:14px;font-weight:bold;color:#ffffff;font-family:Georgia,serif;">' + esc(CLINIC_NAME) + '</div>' +
    '<div style="max-width:240px;display:inline-block;">' + esc(CLINIC_ADDRESS) + '</div>' +
    '<div>Phone: ' + esc(CLINIC_PHONE) + '</div>' +
    '<div>' + esc(CLINIC_HOURS) + '</div>' +
    '</td></tr></table>' +
    '<div style="height:4px;background:#f4c66b;"></div>' +

    // Title row with booking code badge.
    '<table width="100%" style="border-collapse:collapse;"><tr>' +
    '<td style="padding:11px 22px 0;font-size:12px;font-weight:bold;letter-spacing:3px;color:#946d22;">CONSULTATION SHEET</td>' +
    '<td style="padding:11px 22px 0;text-align:right;">' +
    '<span style="display:inline-block;background:#f5edd8;border:1px solid #ecdcb1;border-radius:6px;padding:4px 11px;font-size:11px;color:#7d5a1f;">Booking Code: <strong>' + esc(code) + '</strong></span>' +
    '</td></tr></table>' +

    '<div style="padding:10px 22px 0;">' +

    // ---------------- PATIENT DETAILS ----------------
    '<table width="100%" style="border-collapse:collapse;border:1px solid #ecdcb1;font-size:12px;color:#2c2415;">' +
    '<tr>' +
    '<td style="padding:7px 13px;border-right:1px solid #ecdcb1;border-bottom:1px solid #ecdcb1;width:50%;">Patient Name: <strong>' + esc(f.name) + '</strong></td>' +
    '<td style="padding:7px 13px;border-right:1px solid #ecdcb1;border-bottom:1px solid #ecdcb1;width:25%;">Age / Sex: __________</td>' +
    '<td style="padding:7px 13px;border-bottom:1px solid #ecdcb1;width:25%;">Date: <strong>' + esc(f.date) + '</strong></td>' +
    '</tr>' +
    '<tr>' +
    '<td style="padding:7px 13px;border-right:1px solid #ecdcb1;">Phone: ' + esc(f.phone) + '</td>' +
    '<td style="padding:7px 13px;border-right:1px solid #ecdcb1;">Type: ' + esc(f.patientType) + '</td>' +
    '<td style="padding:7px 13px;">Visit time: ' + esc(f.time) + '</td>' +
    '</tr>' +
    '</table>' +

    // ---------------- VITALS ----------------
    '<table width="100%" style="border-collapse:collapse;border:1px solid #ecdcb1;border-top:none;">' +
    '<tr>' +
    vitalCell_('BP', 'mmHg') +
    vitalCell_('Pulse', '/min') +
    vitalCell_('Temp', '°F') +
    vitalCell_('Weight', 'kg') +
    vitalCell_('SpO2', '%') +
    vitalCell_('RBS', 'mg/dL', true) +
    '</tr></table>' +

    // Chief complaint (reason prefilled from the booking).
    '<table width="100%" style="border-collapse:collapse;border:1px solid #ecdcb1;border-top:none;"><tr>' +
    '<td style="padding:7px 13px;font-size:12px;color:#2c2415;">' +
    '<span style="color:#946d22;font-weight:bold;">Chief complaint / Reason:</span> ' + esc(f.reason) +
    (f.message ? ' &nbsp;&middot;&nbsp; ' + esc(f.message) : '') +
    '</td></tr></table>' +

    // ---------------- BODY: Rx (left) + side panel (right) ----------------
    '<table width="100%" style="border-collapse:collapse;margin-top:12px;"><tr>' +

    // Rx prescription area
    '<td style="vertical-align:top;width:62%;padding-right:14px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:30px;font-weight:bold;color:#946d22;line-height:1;margin-bottom:6px;">&#8478;</div>' +
    ruledLines_(10, 31) +
    '</td>' +

    // Side panel: diagnosis / investigations / advice
    '<td style="vertical-align:top;width:38%;background:#faf6ec;border:1px solid #ecdcb1;padding:0;">' +
    '<div style="padding:10px 14px;border-bottom:1px solid #ecdcb1;">' +
    '<div style="' + blockTitle + '">Diagnosis</div>' + ruledLines_(2, 24) +
    '</div>' +
    '<div style="padding:10px 14px;border-bottom:1px solid #ecdcb1;">' +
    '<div style="' + blockTitle + '">Investigations / Tests</div>' + ruledLines_(4, 24) +
    '</div>' +
    '<div style="padding:10px 14px;">' +
    '<div style="' + blockTitle + '">Advice / Instructions</div>' + ruledLines_(4, 24) +
    '</div>' +
    '</td>' +
    '</tr></table>' +

    // ---------------- FOLLOW-UP ----------------
    '<table width="100%" style="border-collapse:collapse;border:1px solid #ecdcb1;margin-top:12px;font-size:12px;"><tr>' +
    '<td style="padding:8px 13px;border-right:1px solid #ecdcb1;width:55%;color:#2c2415;"><span style="color:#946d22;font-weight:bold;">Next review / Follow-up:</span> ____________________</td>' +
    '<td style="padding:8px 13px;color:#2c2415;">Consultation fee: <strong>' + esc(CONSULTATION_FEE) + '</strong> &middot; Cash / UPI / Card</td>' +
    '</tr></table>' +

    // ---------------- SIGNATURE ----------------
    '<table width="100%" style="border-collapse:collapse;margin-top:16px;"><tr>' +
    '<td style="vertical-align:bottom;width:58%;font-size:10px;color:#a3987f;line-height:1.55;">' +
    'Please carry cash or be ready to pay online (UPI / card) at the clinic, and show your booking code at the reception.' +
    '</td>' +
    '<td style="vertical-align:bottom;text-align:right;font-size:12px;color:#2c2415;">' +
    '<div style="height:28px;border-bottom:1px solid #d8c389;width:200px;display:inline-block;"></div>' +
    '<div style="margin-top:5px;"><strong>' + esc(DOCTOR_NAME) + '</strong></div>' +
    '<div style="font-size:10px;color:#6a5f4b;">' + esc(DOCTOR_QUALIFICATION) + '</div>' +
    '</td>' +
    '</tr></table>' +

    '<div style="margin-top:12px;padding-top:9px;border-top:1px solid #ecdcb1;font-size:9px;color:#a3987f;text-align:center;line-height:1.5;">' +
    esc(CLINIC_NAME) + ' &middot; ' + esc(CLINIC_TAGLINE) + ' &middot; ' + esc(CLINIC_PHONE) + '<br>' +
    'Issued with appointment booking ' + esc(code) + ' on ' + esc(issuedOn) + '. ' +
    'This sheet is not a medical certificate and does not replace emergency care.' +
    '</div>' +

    '</div></body></html>'
  );
}

// First letters of the first two words of the doctor name, e.g. "Dr Ajit" -> "DA".
function monogram_(nameStr) {
  const parts = String(nameStr).trim().split(/\s+/).filter(function (w) {
    return !/^(dr|dr\.|prof|prof\.)$/i.test(w);
  });
  const a = parts[0] ? parts[0].charAt(0) : "";
  const b = parts[1] ? parts[1].charAt(0) : "";
  return (a + b).toUpperCase() || "RX";
}

/* ------------------------------ emails ------------------------------------ */
function clinicHtml(f, code) {
  const rows = [
    ["Booking code", code],
    ["Name", f.name],
    ["Phone", f.phone],
    ["Email", f.email || "Not provided"],
    ["Patient type", f.patientType],
    ["Visit reason", f.reason],
    ["Preferred date", f.date],
    ["Preferred time", f.time],
    ["Scheduling note", f.message || "(none)"],
  ];
  const body = rows.map(function (r) {
    return (
      '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;white-space:nowrap;">' +
      esc(r[0]) + '</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(r[1]) + '</td></tr>'
    );
  }).join("");
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#17212b;">' +
    '<h2 style="margin:0 0 12px;color:#7d5a1f;">New appointment request</h2>' +
    '<p style="margin:0 0 16px;color:#63727e;">Submitted from the clinic website. Consultation sheet (PDF) attached for the visit.</p>' +
    '<table style="border-collapse:collapse;font-size:14px;">' + body + '</table>' +
    '</div>'
  );
}

function patientHtml(f, code) {
  const rows = [
    ["Booking code", code],
    ["Visit reason", f.reason],
    ["Preferred date", f.date],
    ["Preferred time", f.time],
    ["Consultation fee", CONSULTATION_FEE],
  ];
  const body = rows.map(function (r) {
    return (
      '<tr><td style="padding:8px 14px;border:1px solid #ecdcb1;background:#faf6ec;font-weight:700;white-space:nowrap;">' +
      esc(r[0]) + '</td><td style="padding:8px 14px;border:1px solid #ecdcb1;">' + esc(r[1]) + '</td></tr>'
    );
  }).join("");
  const calUrl = googleCalUrl_(f);
  const calBtn = calUrl
    ? '<p style="margin:18px 0 0;"><a href="' + calUrl + '" style="display:inline-block;background:#7d5a1f;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:bold;">Add to my Google Calendar</a></p>'
    : '';
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#17212b;">' +
    '<h2 style="margin:0 0 8px;color:#7d5a1f;">Appointment request received</h2>' +
    '<p style="margin:0 0 16px;color:#2e3c46;">Hi ' + esc(f.name) + ', thank you for booking with ' + esc(CLINIC_NAME) +
    '. Our team will confirm your slot by phone or message.</p>' +
    '<table style="border-collapse:collapse;font-size:14px;">' + body + '</table>' +
    calBtn +
    '<p style="margin:18px 0 0;padding:13px 15px;background:#fff2e2;border:1px solid #f1c797;color:#71351f;font-size:13px;line-height:1.6;">' +
    'Please carry <strong>cash</strong>, or be ready to pay <strong>online (UPI / card)</strong> at the clinic. ' +
    'Show your booking code <strong>' + esc(code) + '</strong> at the reception.</p>' +
    '<p style="margin:14px 0 0;color:#63727e;font-size:13px;">Your consultation sheet (with prescription space) is attached as a PDF. Please bring a printout to your visit.</p>' +
    '</div>'
  );
}

function clinicPlain(f, code) {
  return [
    "New appointment request",
    "Booking code: " + code,
    "Name: " + f.name,
    "Phone: " + f.phone,
    "Email: " + (f.email || "Not provided"),
    "Patient type: " + f.patientType,
    "Visit reason: " + f.reason,
    "Preferred date: " + f.date,
    "Preferred time: " + f.time,
    "Scheduling note: " + (f.message || "(none)"),
  ].join("\n");
}

function patientPlain(f, code) {
  return [
    "Hi " + f.name + ", your appointment request with " + CLINIC_NAME + " has been received.",
    "",
    "Booking code: " + code,
    "Visit reason: " + f.reason,
    "Preferred date: " + f.date,
    "Preferred time: " + f.time,
    "Consultation fee: " + CONSULTATION_FEE,
    "",
    "Please carry cash or be ready for online payment (UPI / card) at the clinic.",
    "Show your booking code at the reception. Consultation sheet PDF attached - please bring a printout.",
  ].join("\n");
}

/* ------------------------------ helpers ----------------------------------- */
function clean(value, fallback) {
  const s = String(value == null ? "" : value).trim();
  return s || fallback;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
