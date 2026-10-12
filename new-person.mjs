// "Can't find your name? Add yourself" on the teacher leave form (owner,
// 8 October 2026). Thai staff and others missing from TMS give their real
// name, role and employment type; the server adds them to the staff list with
// the leave request, and an administrator confirms the details once.
import { el, button } from "./dom.mjs?v=a3893f8159db";
import { teacherActive } from "./schedule-model.mjs?v=a3893f8159db";

// Two roles only (owner, 12 Oct 2026). The server still accepts the older
// "thai_teacher"; "thai_staff" is the stored key for Staff.
const ROLES = [
  ["nes_teacher", "NES teacher"],
  ["thai_staff", "Staff"],
];
// No "Contract" (owner, 12 Oct 2026); the server still accepts it.
const EMPLOYMENT = [
  ["ft", "Full-time"],
  ["pt", "Part-time"],
  ["unsure", "Not sure"],
];
const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
// For close spellings: letters only, no case, accents, spaces or hyphens.
const letters = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\u0e00-\u0e7f]/g, "");
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}
// Up to 2 letters apart (1 for short names), or a short form (Tim, Timothy).
function close(a, b, shortForm = false) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (shortForm && Math.min(a.length, b.length) >= 3)
    if (a.startsWith(b) || b.startsWith(a)) return true;
  return (
    distance(a, b) <= Math.min(2, Math.floor(Math.min(a.length, b.length) / 3))
  );
}
// "Is this you?": the same last name, or a close first and last name.
export function closeNames(people, typed, limit = 3) {
  const pairs = [
    [letters(typed.first), letters(typed.last), "firstname_en", "lastname_en"],
    [
      letters(typed.firstTh),
      letters(typed.lastTh),
      "firstname_th",
      "lastname_th",
    ],
  ].filter(([f, l]) => f && l);
  const scored = [];
  for (const p of people) {
    let best = null;
    for (const [f, l, fk, lk] of pairs) {
      const pf = letters(p[fk]),
        pl = letters(p[lk]);
      if (!pf || !pl || (pf === f && pl === l)) continue;
      if (pl === l || (close(pf, f, true) && close(pl, l)))
        best = Math.min(best ?? Infinity, distance(pf, f) + distance(pl, l));
    }
    if (best != null) scored.push([best, p]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, p]) => p);
}
const fullName = (p) =>
  [p.firstname_en, p.lastname_en].filter(Boolean).join(" ") ||
  [p.firstname_th, p.lastname_th].filter(Boolean).join(" ");

export function initializeNewPerson({ form, getPeople, choose, reactivate }) {
  const select = form.elements.teacher_id;
  const pick = select.closest("label");
  const hint = el("p", "", "input-hint new-person-hint");
  hint.append(
    "Can't find your name? ",
    button("Add yourself to the staff list", () => open(true), "link-button"),
  );
  const box = el("fieldset", "", "new-person");
  box.hidden = true;
  box.disabled = true;
  box.append(
    el("legend", "Add yourself to the staff list"),
    el(
      "p",
      "Use your real name, as on your ID card or passport. You are added to the staff list with this request; an administrator checks the details once.",
      "input-hint",
    ),
  );
  const grid = el("div", "", "new-person-grid");
  const field = (name, label, { required = false, max = 60 } = {}) => {
    const wrap = el("label", required ? label : label + " (optional)");
    const input = el("input");
    input.name = name;
    input.maxLength = max;
    input.required = required;
    input.autocomplete = "off";
    wrap.append(input);
    grid.append(wrap);
    return input;
  };
  const first = field("np_firstname_en", "First name (English)", {
    required: true,
  });
  const last = field("np_lastname_en", "Last name (English)", {
    required: true,
  });
  const nickname = field("np_nickname_en", "Nickname", { max: 40 });
  const firstTh = field("np_firstname_th", "First name (Thai)");
  const lastTh = field("np_lastname_th", "Last name (Thai)");
  box.append(grid);
  const choices = (name, legend, options) => {
    const group = el("fieldset", "", "pill-choices");
    group.append(el("legend", legend));
    for (const [value, label] of options) {
      const wrap = el("label", "", "pill-choice");
      const radio = el("input");
      radio.type = "radio";
      radio.name = name;
      radio.value = value;
      radio.required = true;
      wrap.append(radio, el("span", label));
      group.append(wrap);
    }
    box.append(group);
  };
  choices("np_role", "Role", ROLES);
  choices("np_employment", "Employment", EMPLOYMENT);
  // Already listed under the same name? Offer that person instead.
  const match = el("p", "", "new-person-match");
  match.setAttribute("role", "status");
  match.hidden = true;
  box.append(
    match,
    button("Choose from the list instead", () => open(false), "link-button"),
  );
  pick.after(hint, box);

  function open(on) {
    box.hidden = !on;
    box.disabled = !on;
    hint.hidden = on;
    pick.hidden = on;
    // The list's own "choose a teacher" check must not block sending.
    const comboInput = pick.querySelector(".combo-input");
    if (comboInput) comboInput.disabled = on;
    select.required = !on;
    if (on) {
      select.value = "";
      first.focus();
    }
  }
  function check() {
    const f = norm(first.value),
      l = norm(last.value),
      ft = norm(firstTh.value),
      lt = norm(lastTh.value);
    const found =
      (f && l) || (ft && lt)
        ? getPeople().find(
            (p) =>
              (f &&
                l &&
                norm(p.firstname_en) === f &&
                norm(p.lastname_en) === l) ||
              (ft &&
                lt &&
                norm(p.firstname_th) === ft &&
                norm(p.lastname_th) === lt),
          )
        : null;
    if (found) offer(found);
    else
      suggest({
        first: first.value,
        last: last.value,
        firstTh: firstTh.value,
        lastTh: lastTh.value,
      });
  }
  // The person is listed: choose them, or, if inactive, confirm it is them so
  // the leave sets them back to active (owner, 12 Oct 2026).
  function offer(p) {
    match.replaceChildren();
    match.hidden = false;
    if (teacherActive(p))
      match.append(
        `${fullName(p)} is already in the list. `,
        button(
          "Choose this person",
          () => {
            open(false);
            choose(p.user_id);
          },
          "secondary small",
        ),
      );
    else
      match.append(
        `${fullName(p)} is already in our records, but marked inactive. If you send this leave request, your status will be set back to active, and the date and time of the change will be saved. `,
        button(
          "Yes, this is me",
          () => {
            open(false);
            reactivate(p);
          },
          "secondary small",
        ),
      );
  }
  // Not exactly listed: offer close spellings, if any.
  function suggest(typed) {
    const close = closeNames(getPeople(), typed);
    match.replaceChildren();
    match.hidden = !close.length;
    if (!close.length) return;
    match.append("Is this you?");
    for (const p of close) {
      const line = el("span", "", "new-person-suggestion");
      line.append(
        el("strong", fullName(p)),
        button("This is me", () => offer(p), "secondary small"),
      );
      match.append(line);
    }
  }
  for (const input of [first, last, firstTh, lastTh])
    input.addEventListener("input", check);

  return {
    isOpen: () => !box.hidden,
    // The new person as the server expects it (new_person).
    read() {
      const data = new FormData(form);
      return {
        firstname_en: data.get("np_firstname_en") || "",
        lastname_en: data.get("np_lastname_en") || "",
        nickname_en: data.get("np_nickname_en") || "",
        firstname_th: data.get("np_firstname_th") || "",
        lastname_th: data.get("np_lastname_th") || "",
        role: data.get("np_role"),
        employment: data.get("np_employment"),
      };
    },
    describe(p) {
      const role = ROLES.find(([v]) => v === p.role)?.[1] || "";
      return `${[p.firstname_en, p.lastname_en].join(" ").trim()} · new to the list · ${role}`;
    },
    // After sending: the person now exists; select them and close the panel.
    done(userId) {
      for (const input of box.querySelectorAll("input"))
        if (input.type === "radio") input.checked = false;
        else input.value = "";
      match.hidden = true;
      open(false);
      if (userId) choose(userId);
    },
  };
}
