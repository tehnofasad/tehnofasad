const modal = document.querySelector("#offer-modal");
const openButtons = document.querySelectorAll("[data-open-form]");
const closeButtons = document.querySelectorAll("[data-close-form]");

function openForm() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("input")?.focus();
}

function closeForm() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

openButtons.forEach((button) => button.addEventListener("click", openForm));
closeButtons.forEach((button) => button.addEventListener("click", closeForm));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("is-open")) {
    closeForm();
  }
});

document.querySelector(".offer-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  alert("Cererea a fost pregatita. Conectam urmatorul pas cand stabilim backend-ul.");
  closeForm();
});
