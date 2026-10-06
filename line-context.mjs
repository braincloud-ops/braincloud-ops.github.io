// Ephemeral page memory only. Never persist a LINE token in a URL or browser storage.
let identity = null;
export function connectLine(token, displayName) {
  identity = { token, displayName };
}
export function lineRequestHeaders() {
  return identity ? { "X-Line-Access-Token": identity.token } : {};
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
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = identity.displayName;
    const note = document.createElement("span");
    note.textContent = "Connected to LINE · Submitting as you";
    copy.append(name, note);
    panel.append(avatar, copy);
    input.closest("label").before(panel);
  }
}
