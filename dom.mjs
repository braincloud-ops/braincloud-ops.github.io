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
