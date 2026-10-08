// Company Google sign-in, used by the Team calendar and the Admin page. The
// server decides what the account gets: an administrator session for people
// an owner has granted access, otherwise the read-only team calendar. The
// staff session is remembered on this device (30 days, or until Sign out).
// Local preview offers a demo sign-in with any company address.
import { GOOGLE_CLIENT_ID } from "./config.js?v=4a1753a12e59";

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
export function externalUrl() {
  const url = new URL(location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.href;
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
    slot.append(p, a);
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
      g.renderButton(slot, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
      });
    })
    .catch((error) => handlers.onError(error));
}
