const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".main-nav a");
const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector(".form-status");
const dateInput = document.querySelector('input[name="date"]');

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (!header || !navToggle) return;

    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

if (dateInput) {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  dateInput.min = today.toISOString().split("T")[0];
}

const billingOptions = document.querySelectorAll(".billing-option");
const planAmounts = document.querySelectorAll(".plan-amount");
const planPeriods = document.querySelectorAll(".plan-period");

function setBillingPeriod(period) {
  billingOptions.forEach((button) => {
    const isActive = button.dataset.billing === period;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  planAmounts.forEach((amount) => {
    const value = period === "yearly" ? amount.dataset.yearly : amount.dataset.monthly;
    if (value) {
      amount.textContent = "₹" + Number(value).toLocaleString("en-IN");
    }
  });

  planPeriods.forEach((el) => {
    el.textContent = period === "yearly" ? "/year" : "/month";
  });
}

billingOptions.forEach((button) => {
  button.addEventListener("click", () => setBillingPeriod(button.dataset.billing));
});

// Paste your deployed Google Apps Script Web App URL here (ends in /exec).
// See google-apps-script/SETUP.md for the one-time setup steps.
const APPOINTMENT_ENDPOINT = "https://script.google.com/macros/s/AKfycbw2S4f-_D5JY2bJw8f3lj9DBMSYBlOeg85nnqF88AocClugGUpnvxuIFpeT1xxgNndMgg/exec";

function sendBookingEmail(payload) {
  if (!APPOINTMENT_ENDPOINT || APPOINTMENT_ENDPOINT.indexOf("PASTE_") === 0) {
    return;
  }

  // no-cors + text/plain keeps this a "simple request" so the browser sends it
  // straight to Apps Script without a CORS preflight it can't answer.
  fetch(APPOINTMENT_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

if (form && statusMessage) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const patientName = (data.get("name") || "").toString().trim();
    const phone = (data.get("phone") || "").toString().trim();
    const email = (data.get("email") || "").toString().trim();
    const patientType = (data.get("patientType") || "").toString().trim();
    const reason = (data.get("reason") || "").toString().trim();
    const date = (data.get("date") || "").toString().trim();
    const time = (data.get("time") || "").toString().trim();
    const message = (data.get("message") || "").toString().trim();

    // Email the clinic via the Apps Script backend.
    sendBookingEmail({
      patientName,
      phone,
      email,
      patientType,
      reason,
      date,
      time,
      message,
      submittedAt: new Date().toISOString(),
    });

    statusMessage.textContent = `Thank you, ${patientName}. Your request has been sent to the clinic, and a confirmation with your consultation sheet is on the way to ${email}. The clinic team will confirm your slot by phone.`;
    form.reset();

    if (dateInput) {
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      dateInput.min = today.toISOString().split("T")[0];
    }
  });
}
