// "Can't find your name? Add yourself" on the teacher leave form (owner,
// 8 October 2026). Thai staff and others missing from TMS give their real
// name, role and employment type; the server adds them to the staff list with
// the leave request, and an administrator confirms the details once.
import { el, button } from "./dom.mjs?v=12f7be333ea9";

const ROLES = [
  ["nes_teacher", "NES teacher"],
  ["thai_teacher", "Thai teacher"],
  ["thai_staff", "Thai staff (office)"],
];
const EMPLOYMENT = [
  ["ft", "Full-time"],
  ["pt", "Part-time"],
  ["contract", "Contract"],
  ["unsure", "Not sure"],
];
const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const fullName = (p) =>
  [p.firstname_en, p.lastname_en].filter(Boolean).join(" ") ||
  [p.firstname_th, p.lastname_th].filter(Boolean).join(" ");

export function initializeNewPerson({ form, getPeople, choose }) {
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
    match.replaceChildren();
    match.hidden = !found;
    if (found)
      match.append(
        `${fullName(found)} is already in the list. `,
        button(
          "Choose this person",
          () => {
            open(false);
            choose(found.user_id);
          },
          "secondary small",
        ),
      );
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
      return `${[p.firstname_en, p.lastname_en].join(" ").trim()}${
        p.nickname_en ? ` (${p.nickname_en})` : ""
      } · new to the list · ${role}`;
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
