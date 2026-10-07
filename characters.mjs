// Company curriculum characters used as small, decorative moments. The text
// beside them always carries the message, so images are alt="" (decorative).
// Paths are literal so the build adds a cache version to each.
const files = {
  "girl-cheer": "characters/girl-cheer.webp?v=2355712a139c",
  "girl-thumbs": "characters/girl-thumbs.webp?v=2355712a139c",
  "boy-neutral": "characters/boy-neutral.webp?v=2355712a139c",
  "boy-confused": "characters/boy-confused.webp?v=2355712a139c",
  "robot-r-neutral": "characters/robot-r-neutral.webp?v=2355712a139c",
  "robot-r-confused": "characters/robot-r-confused.webp?v=2355712a139c",
  "robot-b-cheer": "characters/robot-b-cheer.webp?v=2355712a139c",
  "robot-b-wave": "characters/robot-b-wave.webp?v=2355712a139c",
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
