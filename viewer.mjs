// Company Google sign-in, used by the Team calendar and the Admin page. The
// server decides what the account gets: an administrator session for people
// an owner has granted access, otherwise the read-only team calendar. The
// staff session is remembered on this device (30 days, or until Sign out).
// Local preview offers a demo sign-in with any company address.
import { GOOGLE_CLIENT_ID } from "./config.js?v=4374ee290a9d";

const KEY = "braincloud-viewer";
const GIS = "https://accounts.google.com/gsi/client";

export function viewerSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Date.parse(s.expires_at) > Date.now()) return s;
  } catch {}
  return null;
}
export function keepViewer(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export function forgetViewer() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// Google does not allow its sign-in inside app browsers such as LINE's.
export const inLineApp = () => / Line\//i.test(navigator.userAgent);
// The main site (not a LINE entry page) at the same section. The section
// travels as ?go=calendar (the site turns it back into #calendar) because
// the browser-switching links below cannot carry a #fragment.
export function siteUrl() {
  const url = new URL("./", location.href);
  const section = location.hash.slice(1);
  if (section) url.searchParams.set("go", section);
  return url.href;
}
// Leaving LINE's built-in browser. LINE ignores its own openExternalBrowser
// flag for links tapped inside a page, so each phone gets the switch it
// honours: Safari on iPhone, the default browser on Android.
export function externalUrl(ua = navigator.userAgent) {
  const url = new URL(siteUrl());
  if (/iPhone|iPad|iPod/i.test(ua)) return "x-safari-" + url.href;
  if (/Android/i.test(ua))
    return (
      "intent://" +
      url.host +
      url.pathname +
      url.search +
      "#Intent;scheme=https;S.browser_fallback_url=" +
      encodeURIComponent(url.href) +
      ";end"
    );
  url.searchParams.set("openExternalBrowser", "1");
  return url.href;
}
// Inside a LIFF window, LINE's own call is the reliable way out.
function openOutside(event) {
  const liff = globalThis.liff;
  if (!liff?.isInClient?.()) return;
  event.preventDefault();
  const url = new URL(siteUrl());
  url.searchParams.set("openExternalBrowser", "1");
  liff.openWindow({ url: url.href, external: true });
}

let gis = null;
const loadGis = () =>
  (gis ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gis = null;
      reject(new Error("Google sign-in could not be loaded."));
    };
    document.head.append(s);
  }));

// Renders the sign-in control into `slot`. Every sign-in (from any slot)
// reports to the latest handlers: onSession receives the server's session
// ({ kind: "admin" | "viewer", token, expires_at, email, … }).
let handlers = { onSession() {}, onError() {} };
let initialized = false;
async function finish(api, path, data) {
  try {
    handlers.onSession(await api(path, { method: "POST", data }));
  } catch (error) {
    handlers.onError(error);
  }
}
export function signIn(slot, { api, demo, onSession, onError }) {
  handlers = { onSession, onError };
  slot.replaceChildren();
  if (inLineApp()) {
    const p = document.createElement("p");
    p.className = "muted-line";
    p.textContent =
      "Google does not allow sign-in inside the LINE app. Open this page in your phone's browser instead.";
    const a = document.createElement("a");
    a.className = "button-link";
    a.href = externalUrl();
    a.textContent = "Open in your browser";
    a.addEventListener("click", openOutside);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary";
    copy.textContent = "Copy link";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(siteUrl());
        copy.textContent = "Link copied";
      } catch {
        copy.textContent = siteUrl();
      }
    });
    const hint = document.createElement("p");
    hint.className = "input-hint";
    hint.textContent =
      "If nothing happens, tap ⋯ at the top right and choose Open in browser, or paste the copied link into Safari or Chrome.";
    slot.append(p, a, copy, hint);
    return;
  }
  if (!GOOGLE_CLIENT_ID) {
    if (demo) {
      // Preview only: sign in as any synthetic company address.
      const email = document.createElement("input");
      email.type = "email";
      email.className = "demo-email";
      email.value = "demo@braincloudlearning.com";
      email.setAttribute("aria-label", "Demo company email");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "secondary";
      b.textContent = "Demo company sign-in";
      b.addEventListener("click", () =>
        finish(api, "/viewer/demo", { email: email.value }),
      );
      slot.append(email, b);
    } else {
      const p = document.createElement("p");
      p.className = "muted-line";
      p.textContent = "Company sign-in is not set up yet.";
      slot.append(p);
    }
    return;
  }
  loadGis()
    .then(() => {
      const g = globalThis.google.accounts.id;
      if (!initialized) {
        g.initialize({
          client_id: GOOGLE_CLIENT_ID,
          hd: "braincloudlearning.com",
          ux_mode: "popup",
          callback: (r) =>
            finish(api, "/viewer/google", { credential: r.credential }),
        });
        initialized = true;
      }
      // Google's own button opens the sign-in window when tapped: large,
      // as wide as the box allows (Google's limit is 400 px).
      g.renderButton(slot, {
        theme: "filled_blue",
        size: "large",
        text: "signin_with",
        shape: "pill",
        logo_alignment: "left",
        width: Math.max(200, Math.min(400, slot.clientWidth || 320)),
      });
      watchButton(slot, { api, demo, onSession, onError });
    })
    .catch(() => fallback(slot, { api, demo, onSession, onError }));
}
// If Google's button has not appeared (blocked or slow), offer a big retry.
function watchButton(slot, options) {
  setTimeout(() => {
    if (slot.isConnected && !slot.querySelector("iframe, div[role=button]"))
      fallback(slot, options);
  }, 6000);
}
function fallback(slot, options) {
  slot.replaceChildren();
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "signin-retry";
  retry.textContent = "Sign in with Google";
  retry.addEventListener("click", () => {
    gis = null;
    initialized = false;
    signIn(slot, options);
  });
  const note = document.createElement("p");
  note.className = "input-hint";
  note.textContent =
    "Google's sign-in did not load. Tap the button to try again. If it still does not appear, turn off ad or content blockers for this site, or open it in Chrome or Safari.";
  slot.append(retry, note);
}
