const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".main-nav a");
const form = document.querySelector("#appointmentForm");
const statusMessage = document.querySelector(".form-status");

navToggle.addEventListener("click", () => {
  const isOpen = header.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

const CLINIC_WHATSAPP_NUMBER = "916205593020";

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const patientName = (data.get("name") || "").toString().trim();
  const phone = (data.get("phone") || "").toString().trim();
  const reason = (data.get("reason") || "").toString().trim();
  const date = (data.get("date") || "").toString().trim();
  const message = (data.get("message") || "").toString().trim();

  const lines = [
    "*New Appointment Request*",
    `Name: ${patientName}`,
    `Phone: ${phone}`,
    `Reason: ${reason}`,
    `Preferred date: ${date}`,
  ];
  if (message) lines.push(`Message: ${message}`);

  const whatsappUrl = `https://wa.me/${CLINIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;

  statusMessage.textContent = `Thank you, ${patientName}. Opening WhatsApp to send your appointment request to the clinic team.`;
  window.open(whatsappUrl, "_blank", "noopener");
  form.reset();
});
