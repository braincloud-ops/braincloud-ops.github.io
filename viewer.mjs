// Staff sign-in for the read-only team calendar: "Sign in with Google" for
// company accounts only (the server checks the domain), then our own viewer
// session remembered on this device (30 days, or until Sign out). Local preview offers a demo sign-in.
import { GOOGLE_CLIENT_ID } from "./config.js?v=4bb7b27a0ac3";

const KEY = "braincloud-viewer";
const GIS = "https://accounts.google.com/gsi/client";

export function viewerSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Date.parse(s.expires_at) > Date.now()) return s;
  } catch {}
  return null;
}
function keep(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
export function forgetViewer() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
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

// Renders the sign-in control into `slot`; resolves with the session.
export function signIn(slot, { api, demo }) {
  return new Promise((resolve, reject) => {
    slot.replaceChildren();
    const finish = async (path, data) => {
      try {
        const session = await api(path, { method: "POST", data });
        keep(session);
        resolve(session);
      } catch (error) {
        reject(error);
      }
    };
    if (!GOOGLE_CLIENT_ID) {
      if (demo) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "secondary";
        b.textContent = "Demo company sign-in";
        b.addEventListener("click", () => finish("/viewer/demo", {}));
        slot.append(b);
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
        g.initialize({
          client_id: GOOGLE_CLIENT_ID,
          hd: "braincloudlearning.com",
          ux_mode: "popup",
          callback: (r) =>
            finish("/viewer/google", { credential: r.credential }),
        });
        g.renderButton(slot, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
        });
      })
      .catch(reject);
  });
}
