export function el(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text, action, className = "secondary") {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function download(bytes, mime, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = el("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function modal(title) {
  const dialog = el("dialog", "", "detail-dialog");
  const heading = el("h2", title);
  const id = "dialog-" + crypto.randomUUID();
  heading.id = id;
  dialog.setAttribute("aria-labelledby", id);
  const close = button("Close", () => dialog.close());
  const head = el("div", "", "dialog-heading");
  head.append(heading, close);
  const body = el("div", "", "dialog-body");
  dialog.append(head, body);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  return { dialog, body };
}

// Panels and pop-ups close when you click the dimmed area outside them (the
// press must also start outside, so selecting text and releasing outside does
// not close anything). Editing windows keep their typing: they close only with
// their own buttons or Escape.
let pressedOn = null;
document.addEventListener("pointerdown", (event) => {
  pressedOn = event.target;
});
document.addEventListener("click", (event) => {
  const dialog = event.target;
  if (
    !(dialog instanceof HTMLDialogElement) ||
    !dialog.open ||
    pressedOn !== dialog ||
    !dialog.classList.contains("detail-dialog") ||
    dialog.matches(".edit-dialog, .directory-dialog")
  )
    return;
  const r = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= r.left &&
    event.clientX <= r.right &&
    event.clientY >= r.top &&
    event.clientY <= r.bottom;
  if (!inside) dialog.close();
});
