// Ephemeral page memory only. Never persist a LINE token in a URL or browser storage.
let identity = null;
// signOut is given only outside the LINE app (a computer's browser), where
// someone else may use the same browser next.
export function connectLine(
  token,
  displayName,
  pictureURL = null,
  signOut = null,
) {
  identity = { token, displayName, pictureURL, signOut };
}
export const hasLineIdentity = () => Boolean(identity);
export function lineRequestHeaders() {
  return identity ? { "X-Line-Access-Token": identity.token } : {};
}
// "Log in with LINE" under "Submitted by" in an ordinary browser (owner,
// 12 Oct 2026). Optional: it opens the LINE leave page, which asks LINE to sign
// in (on a computer: a QR code or email) and comes back with the name filled in.
export function offerLineSignIn() {
  if (identity) return;
  for (const [id, route] of [
    ["school-form", "school"],
    ["teacher-form", "teacher"],
  ]) {
    const label = document
      .getElementById(id)
      ?.elements.user_name?.closest("label");
    if (!label) continue;
    const box = document.createElement("div");
    box.className = "line-signin";
    const link = document.createElement("a");
    link.className = "line-signin-button";
    link.href = `./liff-teacher.html?line=login&go=${route}`;
    link.textContent = "Log in with LINE";
    const note = document.createElement("small");
    note.textContent =
      "Optional. Fills in your name from LINE and marks your request as LINE-verified. You can still type your name instead.";
    box.append(link, note);
    label.after(box);
  }
}
export function showLineIdentity() {
  if (!identity) return;
  for (const form of document.querySelectorAll("#school-form, #teacher-form")) {
    const input = form.elements.user_name;
    input.value = identity.displayName;
    input.readOnly = true;
    input.closest("label").hidden = true;
    const panel = document.createElement("div");
    panel.className = "line-identity";
    const avatar = document.createElement("span");
    avatar.className = "identity-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = [...identity.displayName][0]?.toUpperCase() || "L";
    if (identity.pictureURL) {
      try {
        const url = new URL(identity.pictureURL);
        if (
          url.protocol === "https:" &&
          url.hostname === "profile.line-scdn.net" &&
          !url.username &&
          !url.password &&
          !url.port
        ) {
          const img = document.createElement("img");
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          img.width = img.height = 44;
          img.addEventListener("error", () => img.remove(), { once: true });
          img.src = url.href;
          avatar.append(img);
        }
      } catch {}
    }
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = identity.displayName;
    const note = document.createElement("span");
    note.textContent = "Connected to LINE · Submitting as you";
    copy.append(name, note);
    if (identity.signOut) {
      const out = document.createElement("button");
      out.type = "button";
      out.className = "link-button";
      out.textContent = "Not you? Sign out of LINE";
      out.addEventListener("click", identity.signOut);
      copy.append(out);
    }
    panel.append(avatar, copy);
    input.closest("label").before(panel);
  }
}
