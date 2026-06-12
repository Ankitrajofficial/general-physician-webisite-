/* =========================================================
   Dr Ajit Kishor — interactions
   ========================================================= */

const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".main-nav a");
const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector(".form-status");
const whatsappFollowup = document.querySelector(".form-whatsapp");
const calendarFollowup = document.querySelector(".form-calendar");
const dateInput = document.querySelector('input[name="date"]');

/* ---------- Mobile navigation ---------- */
const backdrop = document.createElement("div");
backdrop.className = "nav-backdrop";
document.body.appendChild(backdrop);

function setNavOpen(isOpen) {
  if (!header || !navToggle) return;

  header.classList.toggle("nav-open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    setNavOpen(!header.classList.contains("nav-open"));
  });
}

backdrop.addEventListener("click", () => setNavOpen(false));
navLinks.forEach((link) => link.addEventListener("click", () => setNavOpen(false)));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setNavOpen(false);
});

/* ---------- Header shadow on scroll ---------- */
function onScroll() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
}
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- Scroll-reveal animations ---------- */
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && revealEls.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // gentle stagger for grouped items
          entry.target.style.transitionDelay = `${Math.min(index * 60, 180)}ms`;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  revealEls.forEach((el) => observer.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Gallery lightbox (with prev/next navigation) ---------- */
const lightbox = document.querySelector("#lightbox");
const lightboxImg = lightbox ? lightbox.querySelector("img") : null;
const lightboxCap = lightbox ? lightbox.querySelector(".lightbox-cap") : null;
const lightboxClose = lightbox ? lightbox.querySelector(".lightbox-close") : null;
const lightboxPrev = lightbox ? lightbox.querySelector(".lightbox-prev") : null;
const lightboxNext = lightbox ? lightbox.querySelector(".lightbox-next") : null;

let lbItems = [];
let lbIndex = 0;

// Only tiles that have a real, loaded image (placeholders are skipped).
function getViewableItems() {
  return Array.from(document.querySelectorAll(".gallery-item")).filter(
    (item) => !item.classList.contains("is-empty")
  );
}

function renderLightbox(index) {
  if (!lbItems.length || !lightboxImg) return;
  lbIndex = (index + lbItems.length) % lbItems.length;
  const item = lbItems[lbIndex];
  const img = item.querySelector("img");
  const cap = item.querySelector(".gallery-cap");
  lightboxImg.src = img.src;
  lightboxImg.alt = img.alt || "";
  if (lightboxCap) lightboxCap.textContent = cap ? cap.textContent : "";
  // Hide arrows when there is only one photo to browse.
  lightbox.classList.toggle("is-single", lbItems.length < 2);
}

function openLightbox(item) {
  if (!lightbox) return;
  lbItems = getViewableItems();
  const start = lbItems.indexOf(item);
  renderLightbox(start < 0 ? 0 : start);
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

document.querySelectorAll(".gallery-item").forEach((item) => {
  item.addEventListener("click", () => {
    if (item.classList.contains("is-empty")) return;
    openLightbox(item);
  });
});

if (lightboxPrev) {
  lightboxPrev.addEventListener("click", (event) => {
    event.stopPropagation();
    renderLightbox(lbIndex - 1);
  });
}
if (lightboxNext) {
  lightboxNext.addEventListener("click", (event) => {
    event.stopPropagation();
    renderLightbox(lbIndex + 1);
  });
}

if (lightbox) {
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox || event.target === lightboxClose) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    else if (event.key === "ArrowLeft") renderLightbox(lbIndex - 1);
    else if (event.key === "ArrowRight") renderLightbox(lbIndex + 1);
  });
}

/* ---------- Gallery carousel navigation ---------- */
const galleryTrack = document.querySelector(".gallery-grid");
document.querySelectorAll(".gallery-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!galleryTrack) return;
    const dir = Number(btn.dataset.dir) || 1;
    const tile = galleryTrack.querySelector(".gallery-item");
    const styles = getComputedStyle(galleryTrack);
    const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
    const step = tile ? tile.getBoundingClientRect().width + gap : galleryTrack.clientWidth;
    galleryTrack.scrollBy({ left: dir * step, behavior: "smooth" });
  });
});

/* ---------- Minimum appointment date = today ---------- */
function setMinimumDate() {
  if (!dateInput) return;
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  dateInput.min = today.toISOString().split("T")[0];
}
setMinimumDate();

/* ---------- Appointment submission ---------- */
// Deployed Google Apps Script Web App URL (ends in /exec).
// See google-apps-script/SETUP.md for the one-time setup steps.
const APPOINTMENT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbw2S4f-_D5JY2bJw8f3lj9DBMSYBlOeg85nnqF88AocClugGUpnvxuIFpeT1xxgNndMgg/exec";

function sendBookingEmail(payload) {
  if (!APPOINTMENT_ENDPOINT || APPOINTMENT_ENDPOINT.indexOf("PASTE_") === 0) {
    return;
  }
  // no-cors + text/plain keeps this a simple request for Apps Script.
  fetch(APPOINTMENT_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// Build a "Add to Google Calendar" link from the booking details.
// Time slot maps to a start hour; the block is 30 minutes.
function buildCalendarUrl(payload) {
  const parts = String(payload.date).split("-").map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return "";

  const slot = String(payload.time).toLowerCase();
  let hour = 9;
  if (slot.indexOf("afternoon") >= 0) hour = 12;
  else if (slot.indexOf("evening") >= 0) hour = 16;

  const start = new Date(parts[0], parts[1] - 1, parts[2], hour, 0, 0);
  if (isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 30 * 60000);

  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const details = [
    "Reason: " + payload.reason,
    "Name: " + payload.patientName,
    "Phone: " + payload.phone,
    "Fee: INR 300",
    "Please confirm your slot with the clinic.",
  ].join("\n");

  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Appointment - Dr Ajit Kishor Clinic") +
    "&dates=" + fmt(start) + "/" + fmt(end) +
    "&details=" + encodeURIComponent(details) +
    "&location=" +
    encodeURIComponent(
      "Monika Niwaas, opposite Patna College, near Razza High School, Annie Besant Road, Patna 800004, Bihar"
    )
  );
}

function buildWhatsAppUrl(payload) {
  const text = [
    "Hello Dr Ajit Kishor Clinic, I want to book a consultation.",
    "",
    "Name: " + payload.patientName,
    "Phone: " + payload.phone,
    "Reason: " + payload.reason,
    "Preferred date: " + payload.date,
    "Preferred time: " + payload.time,
  ].join("\n");

  return "https://wa.me/916205593020?text=" + encodeURIComponent(text);
}

if (form && statusMessage) {
  const successPanel = document.querySelector(".form-success");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const payload = {
      patientName: (data.get("name") || "").toString().trim(),
      phone: (data.get("phone") || "").toString().trim(),
      email: (data.get("email") || "").toString().trim(),
      patientType: (data.get("patientType") || "").toString().trim(),
      reason: (data.get("reason") || "").toString().trim(),
      date: (data.get("date") || "").toString().trim(),
      time: (data.get("time") || "").toString().trim(),
      message: (data.get("message") || "").toString().trim(),
      submittedAt: new Date().toISOString(),
    };

    // Show a brief "sending" state so the confirmation feels considered,
    // not instant. The request itself is fired right away.
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add("is-loading");
      submitButton.textContent = "Sending Request…";
    }
    if (successPanel) successPanel.hidden = true;

    sendBookingEmail(payload);

    // Deliberate ~1s pause (frontend only) before revealing the confirmation.
    window.setTimeout(() => {
      statusMessage.textContent = `Thank you, ${payload.patientName}. Your appointment request has been sent — our team will confirm your slot by phone or WhatsApp shortly.`;

      const codeEl = successPanel ? successPanel.querySelector(".success-code") : null;
      if (codeEl) {
        codeEl.textContent = `Requested for ${payload.date || "your chosen date"} · ${payload.time || "first available"}`;
      }

      if (calendarFollowup) {
        const calUrl = buildCalendarUrl(payload);
        if (calUrl) {
          calendarFollowup.href = calUrl;
          calendarFollowup.hidden = false;
        }
      }

      if (whatsappFollowup) {
        whatsappFollowup.href = buildWhatsAppUrl(payload);
        whatsappFollowup.hidden = false;
      }

      if (successPanel) {
        successPanel.hidden = false;
        successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      form.reset();
      setMinimumDate();

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("is-loading");
        submitButton.textContent = "Send Appointment Request";
      }
    }, 1000);
  });
}
