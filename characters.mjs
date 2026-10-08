// Company curriculum characters used as small, decorative moments. The text
// beside them always carries the message, so images are alt="" (decorative).
// Paths are literal so the build adds a cache version to each.
const files = {
  "girl-cheer": "characters/girl-cheer.webp?v=c2905086c37a",
  "girl-thumbs": "characters/girl-thumbs.webp?v=c2905086c37a",
  "boy-neutral": "characters/boy-neutral.webp?v=c2905086c37a",
  "boy-confused": "characters/boy-confused.webp?v=c2905086c37a",
  "robot-r-neutral": "characters/robot-r-neutral.webp?v=c2905086c37a",
  "robot-r-confused": "characters/robot-r-confused.webp?v=c2905086c37a",
  "robot-b-cheer": "characters/robot-b-cheer.webp?v=c2905086c37a",
  "robot-b-wave": "characters/robot-b-wave.webp?v=c2905086c37a",
};
export function character(name, { small = false, eager = false } = {}) {
  const img = document.createElement("img");
  img.src = files[name];
  img.alt = "";
  img.className = "character" + (small ? " is-small" : "");
  img.decoding = "async";
  img.loading = eager ? "eager" : "lazy";
  img.draggable = false;
  return img;
}
// A friendly empty or error state: character plus the message text.
export function emptyState(text, name = "robot-r-neutral") {
  const box = document.createElement("div");
  box.className = "empty-state";
  const p = document.createElement("p");
  p.textContent = text;
  box.append(character(name, { small: true }), p);
  return box;
}
