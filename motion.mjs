// Small motion layer: light feedback, transform/opacity only, no libraries.
// Everything is optional decoration; the interface works the same without it.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const calm = () => reduced.matches;

// Pause CSS animations while the tab is hidden (saves battery on phones).
const syncHidden = () =>
  document.documentElement.classList.toggle("is-hidden", document.hidden);
document.addEventListener("visibilitychange", syncHidden);
syncHidden();

// Ring of light where a button, choice or option is pressed.
const pressable =
  "button, .choice-card, .combo-option, .metric-filter, .group-card, summary";
document.addEventListener(
  "pointerdown",
  (event) => {
    if (calm() || event.button > 0) return;
    const target = event.target.closest(pressable);
    if (!target || target.disabled) return;
    ring(event.clientX, event.clientY);
  },
  { passive: true },
);
export function ring(x, y, lime = false) {
  if (calm()) return;
  const node = document.createElement("span");
  node.className = "press-ring" + (lime ? " is-lime" : "");
  node.style.left = x + "px";
  node.style.top = y + "px";
  document.body.append(node);
  const done = () => node.remove();
  node.addEventListener("animationend", done, { once: true });
  // animationend never fires in a background tab.
  setTimeout(done, 900);
}

// Restartable "punch" on a value that changed.
export function punch(node) {
  if (!node || calm()) return;
  node.classList.remove("punch");
  void node.offsetWidth;
  node.classList.add("punch");
}

// Headline numbers "decode": digits cycle briefly, then settle on the value.
// Only 0-9 change, and figures are tabular, so the layout never shifts.
export function decode(node, text) {
  node.textContent = text;
  if (calm() || !/\d/.test(text)) return;
  const started = performance.now();
  const step = (now) => {
    if (node.textContent === text && now - started > 0 && !node.isConnected)
      return;
    if (now - started >= 400) {
      node.textContent = text;
      return;
    }
    node.textContent = text.replace(/\d/g, () =>
      String(Math.floor(Math.random() * 10)),
    );
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // requestAnimationFrame pauses in a background tab; the value still lands.
  setTimeout(() => (node.textContent = text), 450);
}

// Stagger children in as they appear (capped so long lists stay quick).
export function rise(nodes) {
  if (calm()) return;
  [...nodes].forEach((node, i) => {
    node.style.setProperty("--i", String(i));
    node.classList.remove("rise");
    void node.offsetWidth;
    node.classList.add("rise");
  });
}

// Page sections ease in when the route changes.
export function enterSection(section) {
  if (!section || calm()) return;
  section.classList.remove("is-entering");
  void section.offsetWidth;
  section.classList.add("is-entering");
  setTimeout(() => section.classList.remove("is-entering"), 900);
}

// A short shake on the field the browser rejects, alongside its message.
document.addEventListener(
  "invalid",
  (event) => {
    const field = event.target.closest("label, .choice-cards") || event.target;
    if (calm()) return;
    field.classList.remove("shake");
    void field.offsetWidth;
    field.classList.add("shake");
    setTimeout(() => field.classList.remove("shake"), 600);
  },
  true,
);

// Celebration for a successful submission: a ring and a few dots.
export function burst(container) {
  if (calm()) return null;
  const node = document.createElement("span");
  node.className = "burst";
  node.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("span");
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2,
      distance = 34 + (i % 2) * 14;
    dot.style.setProperty("--dx", Math.cos(angle) * distance + "px");
    dot.style.setProperty("--dy", Math.sin(angle) * distance + "px");
    dot.style.animationDelay = i * 25 + "ms";
    node.append(dot);
  }
  container.append(node);
  setTimeout(() => node.remove(), 1200);
  return node;
}
