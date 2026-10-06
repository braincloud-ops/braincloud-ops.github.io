import { API_URL } from "./config.js?v=c6b654bacca3";
import { connectLine } from "./line-context.mjs?v=c6b654bacca3";
const entries = {
  school: { id: "2008775079-PKwtDJOx", route: "school" },
  teacher: { id: "2008775079-dguzgLe4", route: "teacher" },
  dashboard: { id: "2008775079-7d0dO0Y0", route: "reports" },
};
const entry = entries[document.body.dataset.entry];
const status = document.getElementById("liff-status");
const base =
  API_URL ||
  (["localhost", "127.0.0.1"].includes(location.hostname) ? "/api" : "");

async function mountApplication() {
  const response = await fetch("./index.html?v=c6b654bacca3");
  if (!response.ok) throw new Error("Application unavailable");
  const documentTemplate = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );
  documentTemplate
    .querySelectorAll("script")
    .forEach((script) => script.remove());
  // Keep the LIFF endpoint/document and SDK context. No redirect to a separate app.
  // Only our own fixed, static application shell is used, never user/LINE HTML.
  document.body.replaceChildren(...documentTemplate.body.childNodes);
  document.body.className = "liff-app";
  // Initialization has completed: now remove credential parameters and select the form.
  history.replaceState(null, "", `${location.pathname}#${entry.route}`);
  await import("./app.mjs?v=c6b654bacca3");
}

async function openEntry() {
  if (!entry || !globalThis.liff) {
    status.textContent =
      "LINE could not load. Use the button below to continue without LINE.";
    return;
  }
  const waiting = setTimeout(() => {
    status.textContent =
      "LINE is taking longer than usual. You can continue without LINE using the button below.";
  }, 8000);
  try {
    await globalThis.liff.init({
      liffId: entry.id,
      withLoginOnExternalBrowser: false,
    });
    if (globalThis.liff.isLoggedIn()) {
      status.textContent = "Connecting your LINE account…";
      const token = globalThis.liff.getAccessToken();
      if (!token || !base) throw new Error("No LINE connection");
      const response = await fetch(`${base}/line/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Line-Access-Token": token,
        },
        body: "{}",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("LINE verification unavailable");
      const profile = await response.json();
      if (
        typeof profile.display_name !== "string" ||
        !profile.display_name.trim()
      )
        throw new Error("Invalid profile");
      connectLine(token, profile.display_name);
    } else if (globalThis.liff.isInClient()) {
      throw new Error("LINE account unavailable");
    }
    await mountApplication();
  } catch {
    // Never log SDK errors or URL/token/profile information.
    status.textContent =
      "Your LINE connection could not be confirmed. Reopen this page from LINE, or use the button below to continue without LINE.";
  } finally {
    clearTimeout(waiting);
  }
}
openEntry();
