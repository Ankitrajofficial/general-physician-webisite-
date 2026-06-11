# Email notifications for appointment bookings

The website form posts each booking to a Google Apps Script web app, which emails
the clinic. One-time setup, no server or paid service required.

## 1. Create the script
1. Go to https://script.google.com and click **New project**.
2. Delete the sample code, paste everything from `Code.gs`.
3. At the top of the file, fill in the `CONFIG` block:
   - `RECIPIENT_EMAIL` — the clinic email that should receive bookings.
   - `CLINIC_NAME`, `CLINIC_TAGLINE`, `CLINIC_ADDRESS`, `CLINIC_PHONE` — shown on
     the emails and the consultation sheet.
   - `CONSULTATION_FEE` — amount printed on the sheet (e.g. `INR 300`).
   - `DOCTOR_NAME`, `DOCTOR_QUALIFICATION`, `DOCTOR_REG_NO` — printed on the sheet.
   - `SHEET_ID` — optional, see step 1b below. Leave `""` to skip.
   - `ADD_TO_CALENDAR`, `CALENDAR_ID`, `APPOINTMENT_DURATION_MIN` — calendar
     options (see section 6). Leave the defaults to add every booking to the
     clinic's Google Calendar and invite the patient.
4. Click the **Save** icon.

### 1b. (Optional) Log every booking to a Google Sheet
1. Create a new sheet at https://sheets.new and give it a name.
2. Copy its **Sheet ID** from the URL — the part between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
3. Paste it into `SHEET_ID` in the code: `const SHEET_ID = "THIS_PART";`
4. The script auto-adds a header row on the first booking, then appends one row
   per booking (timestamp, code, name, phone, email, type, reason, date, time,
   scheduling note).
   The sheet must belong to (or be shared as editor with) the account running
   the script.

## 2. Deploy as a Web App
1. Click **Deploy → New deployment**.
2. Next to "Select type", click the gear and choose **Web app**.
3. Settings:
   - **Execute as:** Me (the clinic's Google account)
   - **Who has access:** Anyone
4. Click **Deploy**. Approve the permissions prompt. The script needs to **send
   email** (`MailApp`), **convert the sheet HTML to a PDF** (a Drive permission),
   **create Google Calendar events** (a Calendar permission), and — if you set
   `SHEET_ID` — **edit the Google Sheet** (a Sheets permission).
   Approve all of them. You may see an "unverified app" warning; choose
   **Advanced → Go to project (unsafe)** since it is your own script.
5. Copy the **Web app URL** (ends in `/exec`).

## 3. Connect the website
1. Open `script.js` in the website.
2. Find `APPOINTMENT_ENDPOINT` near the top and paste the Web app URL between the
   quotes:
   ```js
   const APPOINTMENT_ENDPOINT = "https://script.google.com/macros/s/AKfy.../exec";
   ```
3. Save and re-upload `script.js` to your host.

## 4. Test
- Open the site, submit a test booking **with an email address**. You should get:
  - **Clinic inbox:** "New appointment request - <name> (CODE)" + receipt PDF.
  - **Patient inbox:** "Your appointment request with <clinic> (CODE)" + receipt PDF.
- Open the attached PDF — it shows clinic header, the booking code, appointment
  details, the fee, and the "carry cash or pay online" note.
- To test the URL directly, open the `/exec` link in a browser — it returns
  `{"ok":true,"service":"appointment-notifier"}`.

## What each booking produces
- A unique **booking code** (e.g. `DAK-20260606-4821`) shown in both emails and
  the PDF receipt.
- A **clinical PDF receipt** attached to both emails.
- **Two emails:** clinic notification + patient confirmation (patient email only
  sent when the patient filled the optional email field).

## 6. Calendar — adds each booking to Google Calendar
On by default (`ADD_TO_CALENDAR = true`). For every booking the script:
- Creates an event on the **clinic's calendar** (the account that owns the
  script), on the preferred date. The time slot maps to a start time —
  Morning → 9:00 AM, Afternoon → 12:00 PM, Evening → 4:00 PM, "First available"
  → 9:00 AM — and lasts `APPOINTMENT_DURATION_MIN` minutes (default 30). The
  clinic can drag it to the exact time when confirming.
- Adds the **patient as a guest** (when they gave an email), so Google emails
  them a calendar invite that lands on **their** calendar once accepted. The
  patient's confirmation email also has an **"Add to my Google Calendar"** button,
  and the website shows the same button right after they submit.

Options in the `CONFIG` block:
- `ADD_TO_CALENDAR` — set to `false` to turn the calendar off entirely.
- `CALENDAR_ID` — leave `""` to use the clinic account's default calendar, or
  paste a specific Calendar ID (Google Calendar ▸ that calendar's **Settings** ▸
  **Integrate calendar** ▸ **Calendar ID**) to use a dedicated "Appointments"
  calendar.
- `APPOINTMENT_DURATION_MIN` — block length in minutes.

> **Important:** because this is a code change, paste the updated `Code.gs`, then
> **Deploy → Manage deployments → Edit → Deploy** (or just **Run** `doGet` once)
> and approve the new **Calendar** permission. Until you re-authorize, only the
> emails run; the website's instant "Add to my Google Calendar" button still
> works for patients on its own.

## 5. (Optional) Scheduled jobs — daily summary + reminders
These need `SHEET_ID` set (step 1b), since they read from the bookings sheet.

- **`sendDailySummary`** — each morning, emails the clinic a PDF of all bookings.
- **`sendDayBeforeReminders`** — each evening, emails a reminder to every patient
  whose preferred date is the next day (marks a "Reminder sent" column so no one
  is reminded twice).

Install both schedules at once:
1. In the editor, open the function dropdown (top toolbar), choose **`setupTriggers`**,
   click **Run**. Approve the extra permission prompt (it needs to manage triggers).
2. That creates a daily ~8 AM summary and a daily ~6 PM reminder run. Apps Script
   uses an hour *window*, not an exact minute.
3. To see or change them, click the ⏰ **Triggers** icon in the left sidebar.

To change the times, edit `atHour(8)` / `atHour(18)` in `setupTriggers` and run it
again (it removes the old ones first). To test immediately, just **Run** the
function directly from the editor.

## Notes
- After submitting, the website reveals a WhatsApp follow-up link with the same
  booking details. The email request is still sent through Apps Script.
- Emails send **from the account that owns the script** and deliver to
  `RECIPIENT_EMAIL`. `replyTo` lets the clinic reply straight to the patient.
- Gmail sending limit on a free account is ~100 emails/day. Each booking with a
  patient email sends 2 emails, so that covers ~50 bookings/day.
- To change the email later, edit `RECIPIENT_EMAIL` and **Deploy → Manage
  deployments → Edit → Deploy** (re-deploying keeps the same URL).
