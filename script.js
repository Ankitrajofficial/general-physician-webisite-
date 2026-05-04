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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const patientName = data.get("name").toString().trim();

  statusMessage.textContent = `Thank you, ${patientName}. The clinic team will call you shortly to confirm the visit.`;
  form.reset();
});
