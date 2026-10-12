// Company curriculum characters used as small, decorative moments. The text
// beside them always carries the message, so images are alt="" (decorative).
// Paths are literal so the build adds a cache version to each.
const files = {
  "girl-cheer": "characters/girl-cheer.webp?v=a3893f8159db",
  "girl-thumbs": "characters/girl-thumbs.webp?v=a3893f8159db",
  "boy-neutral": "characters/boy-neutral.webp?v=a3893f8159db",
  "boy-confused": "characters/boy-confused.webp?v=a3893f8159db",
  "robot-r-neutral": "characters/robot-r-neutral.webp?v=a3893f8159db",
  "robot-r-confused": "characters/robot-r-confused.webp?v=a3893f8159db",
  "robot-b-cheer": "characters/robot-b-cheer.webp?v=a3893f8159db",
  "robot-b-wave": "characters/robot-b-wave.webp?v=a3893f8159db",
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
