// Only these fixed destinations can be opened. Never forward LINE URL parameters.
const entries = {
  school: { id: "2008775079-PKwtDJOx", route: "school" },
  teacher: { id: "2008775079-dguzgLe4", route: "teacher" },
  dashboard: { id: "2008775079-7d0dO0Y0", route: "reports" },
};
const entry = entries[document.body.dataset.entry];
const status = document.getElementById("liff-status");
async function openEntry() {
  if (!entry || !globalThis.liff) {
    status.textContent =
      "You can open the page directly using the button below.";
    return;
  }
  const waiting = setTimeout(() => {
    status.textContent =
      "LINE is taking longer than usual. You can use the button below to continue.";
  }, 8000);
  try {
    await globalThis.liff.init({
      liffId: entry.id,
      withLoginOnExternalBrowser: false,
    });
    // The destination is a browser app: it does not use LINE identity or SDK methods.
    // URL changes must wait until LIFF initialization (including its redirects) completes.
    location.replace(new URL(`./#${entry.route}`, location.href).href);
  } catch {
    // Do not log SDK errors or the current URL: either can contain identity information.
    status.textContent =
      "The LINE connection could not be completed. Open the page below; no LINE sign-in is needed.";
  } finally {
    clearTimeout(waiting);
  }
}
openEntry();
