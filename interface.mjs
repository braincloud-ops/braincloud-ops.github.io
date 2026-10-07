// Small, local interface helpers. No analytics, identity access or stored session.
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  school:
    '<path d="M3 21V8l9-5 9 5v13M1 21h22M9 21v-7h6v7M7 10h.01M17 10h.01M12 7h.01"/>',
  teacher:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3M4 21h16"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h3m4 0h3M7 18h3"/>',
  chart: '<path d="M4 3v18h18M8 16v-5m5 5V6m5 10V9"/>',
  workspace:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12m4-8h4m-4 4h4"/>',
  learning: '<path d="m2 8 10-5 10 5-10 5ZM6 10v7c4 3 8 3 12 0v-7m4-2v9"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  sick: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
  annual:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  other:
    '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
};
for (const node of document.querySelectorAll("[data-icon]")) {
  const drawing = paths[node.dataset.icon];
  if (drawing)
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawing}</svg>`;
}
const menu = document.getElementById("menu-toggle");
const sidebar = document.getElementById("primary-navigation");
if (menu && sidebar) {
  document.body.classList.add("js-navigation");
  menu.hidden = false;
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    sidebar.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.textContent = open ? "Close menu" : "Menu";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      closeNavigation();
      menu.focus();
    }
  });
  matchMedia("(max-width: 900px)").addEventListener("change", closeNavigation);
}
document.querySelector(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  document.getElementById("main-content").focus();
});
export function closeNavigation() {
  sidebar?.classList.remove("is-open");
  menu?.setAttribute("aria-expanded", "false");
  if (menu) menu.textContent = "Menu";
}
