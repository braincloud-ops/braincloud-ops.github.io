// Administrator directory: keep people and schools up to date in one place.
// Saves send the values the editor saw, so a record changed meanwhile by
// someone else is refused instead of silently overwritten.
import { el, button, modal } from "./dom.mjs?v=7974d4d75686";
import { emptyState } from "./characters.mjs?v=7974d4d75686";
import { rise } from "./motion.mjs?v=7974d4d75686";
import { groupTone, teacherActive } from "./schedule-model.mjs?v=7974d4d75686";
import { combobox } from "./combobox.mjs?v=7974d4d75686";
import { loadProvinceNames, provinceKey } from "./school-map.mjs?v=7974d4d75686";
import { mapsLink } from "./school-sheet.mjs?v=7974d4d75686";

const TYPE_LABEL = {
  210: "FT",
  220: "PT",
  230: "Contract",
  100: "External",
  999: "N/A",
};
const PERSON_VIEWS = [
  ["teachers", "Teachers (FT/PT)"],
  ["bc", "All Braincloud staff"],
  ["schools", "School contacts"],
  ["all", "Everyone"],
];
const PAGE = 60;
const fullName = (p) =>
  [p.firstname_en, p.lastname_en].filter(Boolean).join(" ") || p.user_id;
const thaiName = (p) =>
  [p.firstname_th, p.lastname_th].filter(Boolean).join(" ");
const isBC = (p) => String(p.affiliation || "").toUpperCase() === "BC";
const isTeacher = (p) => [210, 220].includes(Number(p.user_type));

// "6.41234, 101.80012" (as Google Maps copies it) -> a point in Thailand.
// Empty -> null (no location); anything else -> false.
export function parseLocation(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const m = t.match(
    /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/,
  );
  if (!m) return false;
  const latitude = Math.round(Number(m[1]) * 1e6) / 1e6,
    longitude = Math.round(Number(m[2]) * 1e6) / 1e6;
  if (latitude < 5 || latitude > 21 || longitude < 97 || longitude > 106)
    return false;
  return { latitude, longitude };
}

export function initializeDirectory({ api, message, onChanged = () => {} }) {
  const root = document.getElementById("directory-root");
  const st = {
    data: null,
    mode: "people",
    view: "teachers",
    status: "active",
    issue: null,
    search: "",
    shown: PAGE,
  };

  // ── Toolbar ──
  const modeButtons = [
    ["people", "People"],
    ["schools", "Schools"],
  ].map(([mode, label]) => {
    const b = button(label, () => {
      st.mode = mode;
      st.issue = null;
      st.shown = PAGE;
      render();
    });
    b.dataset.mode = mode;
    return b;
  });
  const modeGroup = el("div", "", "segmented");
  modeGroup.setAttribute("role", "group");
  modeGroup.setAttribute("aria-label", "Directory");
  modeGroup.append(...modeButtons);
  const add = button("Add", () =>
    st.mode === "people" ? editPerson(null) : editSchool(null),
  );
  const search = document.createElement("input");
  search.type = "search";
  search.className = "cal-search";
  search.setAttribute("aria-label", "Search the directory");
  search.addEventListener("input", () => {
    st.search = search.value.trim().toLowerCase();
    st.shown = PAGE;
    renderList();
  });
  const viewSelect = select("Show", PERSON_VIEWS, () => {
    st.view = viewSelect.value;
    st.shown = PAGE;
    render();
  });
  const statusSelect = select(
    "Status",
    [
      ["active", "Active"],
      ["inactive", "Inactive"],
      ["all", "Any status"],
    ],
    () => {
      st.status = statusSelect.value;
      st.shown = PAGE;
      render();
    },
  );
  const health = el("div", "", "data-health");
  const count = el("p", "", "cal-status");
  count.setAttribute("role", "status");
  const list = el("div", "", "directory-list");
  const toolbar = el("div", "", "cal-toolbar");
  toolbar.append(modeGroup, add);
  const filters = el("div", "", "cal-filters");
  filters.append(
    viewSelect.closest("label"),
    statusSelect.closest("label"),
    search,
  );
  const fresh = el("section", "", "new-codes");
  fresh.hidden = true;
  root.append(toolbar, filters, health, fresh, count, list);

  // School codes the timetable uses that the directory does not know: the
  // schedule sync cannot store their classes until the school is added.
  function renderNewCodes() {
    const added = new Set(
      (st.data?.schools || []).map((s) => String(s.school_code).toUpperCase()),
    );
    const codes =
      st.mode === "schools"
        ? (st.data?.newCodes || []).filter(
            (c) => !added.has(String(c.code).toUpperCase()),
          )
        : [];
    fresh.hidden = !codes.length;
    fresh.replaceChildren();
    if (!codes.length) return;
    fresh.append(
      el(
        "h3",
        `New in the timetable: ${codes.length} school ${codes.length === 1 ? "code" : "codes"}`,
      ),
      el(
        "p",
        "Their classes are not imported until the school is added. After adding, classes from today on arrive within 5 minutes.",
        "input-hint",
      ),
    );
    const ul = el("ul", "", "new-code-list");
    for (const c of codes) {
      const li = el("li");
      const text = el(
        "span",
        `${c.code} · ${c.sessions_seen} ${c.sessions_seen === 1 ? "class" : "classes"} ${c.first_date === c.last_date ? `on ${c.first_date}` : `${c.first_date} to ${c.last_date}`}` +
          (c.sample_classes?.length
            ? ` · e.g. ${c.sample_classes.join(", ")}`
            : ""),
      );
      li.append(
        text,
        button("Add this school", () =>
          editSchool(null, { school_code: c.code }),
        ),
      );
      ul.append(li);
    }
    fresh.append(ul);
  }

  function select(label, options, onChange) {
    const wrap = el("label", label, "inline-select");
    const s = document.createElement("select");
    for (const [v, text] of options) s.append(new Option(text, v));
    s.addEventListener("change", onChange);
    wrap.append(s);
    return s;
  }

  async function load() {
    count.textContent = "Loading the directory…";
    try {
      const { data } = await api("/admin/directory");
      st.data = data;
      render();
    } catch (error) {
      list.replaceChildren(
        emptyState(
          "The directory could not be loaded. " + error.message,
          "robot-r-confused",
        ),
      );
      count.textContent = "";
    }
  }

  // ── People ──
  const peopleIssues = () => {
    const people = st.data.people;
    return [
      [
        "no-type",
        "Braincloud staff without FT/PT",
        (p) => isBC(p) && teacherActive(p) && p.user_type == null,
      ],
      [
        "no-nickname",
        "Active teachers without a nickname",
        (p) => isTeacher(p) && teacherActive(p) && !p.nickname_en,
      ],
      [
        "no-tms",
        "Active teachers without a TMS ID",
        (p) => isTeacher(p) && teacherActive(p) && !p.braincloud_id,
      ],
    ].map(([key, label, test]) => ({
      key,
      label,
      test,
      n: people.filter(test).length,
    }));
  };
  const schoolIssues = () =>
    [
      [
        "no-group",
        "Active schools without a group",
        (s) => s.status === "active" && !s.school_group,
      ],
      [
        "no-tms",
        "Active schools without a TMS ID",
        (s) => s.status === "active" && !s.braincloud_school_id,
      ],
      [
        "no-location",
        "Active schools without a map location",
        (s) => s.status === "active" && s.latitude == null,
      ],
    ].map(([key, label, test]) => ({
      key,
      label,
      test,
      n: st.data.schools.filter(test).length,
    }));
  function rows() {
    const issue = (st.mode === "people" ? peopleIssues() : schoolIssues()).find(
      (i) => i.key === st.issue,
    );
    if (st.mode === "people")
      return st.data.people
        .filter((p) =>
          issue
            ? issue.test(p)
            : (st.view === "all" ||
                (st.view === "teachers" && isTeacher(p)) ||
                (st.view === "bc" && isBC(p)) ||
                (st.view === "schools" && !isBC(p))) &&
              (st.status === "all" ||
                (st.status === "active") === teacherActive(p)),
        )
        .filter(
          (p) =>
            !st.search ||
            [
              p.user_id,
              fullName(p),
              thaiName(p),
              p.nickname_en,
              p.nickname_th,
              p.affiliation,
              p.braincloud_id,
            ]
              .join(" ")
              .toLowerCase()
              .includes(st.search),
        )
        .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    return st.data.schools
      .filter((s) =>
        issue ? issue.test(s) : st.status === "all" || s.status === st.status,
      )
      .filter(
        (s) =>
          !st.search ||
          [
            s.school_code,
            s.school_name_en,
            s.school_name_th,
            s.school_group,
            s.school_province,
          ]
            .join(" ")
            .toLowerCase()
            .includes(st.search),
      );
  }
  function render() {
    for (const b of modeButtons)
      b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode));
    viewSelect.closest("label").hidden = st.mode !== "people";
    add.textContent = st.mode === "people" ? "Add a person" : "Add a school";
    search.placeholder =
      st.mode === "people"
        ? "Search name, nickname, ID or school code"
        : "Search code, name, group or province";
    if (!st.data) return;
    health.replaceChildren();
    for (const issue of st.mode === "people"
      ? peopleIssues()
      : schoolIssues()) {
      if (!issue.n && st.issue !== issue.key) continue;
      const b = button(
        `${issue.n} · ${issue.label}`,
        () => {
          st.issue = st.issue === issue.key ? null : issue.key;
          st.shown = PAGE;
          render();
        },
        "health-chip",
      );
      b.setAttribute("aria-pressed", String(st.issue === issue.key));
      health.append(b);
    }
    renderNewCodes();
    renderList();
  }
  function renderList() {
    if (!st.data) return;
    const all = rows();
    count.textContent = `${all.length} ${st.mode === "people" ? "people" : "schools"}${
      st.issue ? " · showing a data check (tap it again to clear)" : ""
    }`;
    list.replaceChildren();
    if (!all.length) {
      list.append(emptyState("Nothing matches these filters.", "boy-confused"));
      return;
    }
    for (const item of all.slice(0, st.shown))
      list.append(st.mode === "people" ? personRow(item) : schoolRow(item));
    if (all.length > st.shown)
      list.append(
        button(`Show ${Math.min(PAGE, all.length - st.shown)} more`, () => {
          st.shown += PAGE;
          renderList();
        }),
      );
    rise([...list.children].slice(0, 6));
  }
  function personRow(p) {
    const row = button("", () => editPerson(p), "directory-row");
    const main = el("span", "", "directory-main");
    const name = el("strong", fullName(p));
    main.append(name);
    if (p.nickname_en) main.append(el("span", ` (${p.nickname_en})`, "nick"));
    const type = TYPE_LABEL[p.user_type];
    if (type) main.append(" ", el("span", type, "type-tag"));
    const sub = el(
      "span",
      [
        thaiName(p),
        p.affiliation,
        p.user_id,
        p.braincloud_id ? `TMS ${p.braincloud_id}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      "directory-sub",
    );
    const status = el(
      "span",
      teacherActive(p) ? "Active" : "Inactive",
      "state-pill",
    );
    status.dataset.state = teacherActive(p) ? "handled" : "inactive";
    row.append(main, sub, status);
    return row;
  }
  function schoolRow(s) {
    const row = button("", () => editSchool(s), "directory-row");
    const main = el("span", "", "directory-main");
    const chip = el("span", s.school_code, "group-chip");
    chip.dataset.tone = groupTone(s.school_group);
    main.append(
      chip,
      " ",
      el("strong", s.school_name_th || s.school_name_en || ""),
    );
    const sub = el(
      "span",
      [
        s.school_name_th ? s.school_name_en : "",
        s.school_group,
        s.school_province,
      ]
        .filter(Boolean)
        .join(" · "),
      "directory-sub",
    );
    const status = el(
      "span",
      s.status === "active" ? "Active" : "Inactive",
      "state-pill",
    );
    status.dataset.state = s.status === "active" ? "handled" : "inactive";
    row.append(main, sub, status);
    return row;
  }

  // ── Edit dialogs ──
  function field(
    form,
    name,
    label,
    value,
    { type = "text", options, hint, required, maxlength } = {},
  ) {
    const wrap = el("label", label);
    let input;
    if (options) {
      input = document.createElement("select");
      for (const [v, text] of options) input.append(new Option(text, v));
    } else {
      input = document.createElement("input");
      input.type = type;
      if (maxlength) input.maxLength = maxlength;
    }
    input.name = name;
    input.value = value == null ? "" : String(value);
    if (required) input.required = true;
    wrap.append(input);
    if (hint) wrap.append(el("small", hint, "input-hint"));
    form.append(wrap);
    return input;
  }
  function dialogForm(title) {
    const { dialog, body } = modal(title);
    dialog.classList.add("directory-dialog");
    const form = document.createElement("form");
    form.className = "directory-form";
    body.append(form);
    return { dialog, form };
  }
  function actions(form, dialog) {
    const bar = el("div", "", "dialog-actions");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    bar.append(
      save,
      button("Cancel", () => dialog.close()),
    );
    form.append(bar);
    return save;
  }
  // Only fields that changed are sent, with the values the editor saw.
  function diff(form, original, fields, numeric = []) {
    const before = {},
      changes = {};
    for (const key of fields) {
      const input = form.elements[key];
      if (!input) continue;
      const now = input.value.trim(),
        was = original?.[key] == null ? "" : String(original[key]);
      if (now === was) continue;
      before[key] = original ? (original[key] ?? null) : null;
      changes[key] =
        now === "" ? null : numeric.includes(key) ? Number(now) : now;
    }
    return { before, changes };
  }
  async function submit(form, dialog, path, payload, done) {
    const save = form.querySelector("[type=submit]");
    save.disabled = true;
    try {
      const { data } = await api(path, { method: "POST", data: payload });
      dialog.close();
      done(data);
      onChanged();
      render();
    } catch (error) {
      message(error.message, true);
      save.disabled = false;
    }
  }
  const typeOptions = () => [
    ["", "Not set"],
    ...st.data.userTypes
      .filter((t) => t.user_type !== 999)
      .map((t) => [
        String(t.user_type),
        `${TYPE_LABEL[t.user_type] || t.user_type} · ${t.user_type_description}`,
      ]),
  ];
  const positionOptions = () => [
    ["", "Not set"],
    ...st.data.positions.map((p) => [
      String(p.position_type_id),
      p.position_type,
    ]),
  ];
  function editPerson(p) {
    const { dialog, form } = dialogForm(
      p ? `Edit ${fullName(p)}` : "Add a person",
    );
    if (p)
      form.append(
        el(
          "p",
          `${p.user_id}${p.braincloud_id ? ` · TMS ${p.braincloud_id}` : ""}`,
          "muted-line",
        ),
      );
    const grid = el("div", "", "form-grid");
    form.append(grid);
    field(grid, "firstname_en", "First name (English)", p?.firstname_en, {
      required: true,
      maxlength: 120,
    });
    field(grid, "lastname_en", "Last name (English)", p?.lastname_en, {
      maxlength: 120,
    });
    field(grid, "nickname_en", "Nickname (English)", p?.nickname_en, {
      maxlength: 120,
    });
    field(grid, "firstname_th", "First name (Thai)", p?.firstname_th, {
      maxlength: 120,
    });
    field(grid, "lastname_th", "Last name (Thai)", p?.lastname_th, {
      maxlength: 120,
    });
    field(grid, "nickname_th", "Nickname (Thai)", p?.nickname_th, {
      maxlength: 120,
    });
    field(grid, "user_type", "FT / PT", p?.user_type, {
      options: typeOptions(),
    });
    field(grid, "position", "Position", p?.position, {
      options: positionOptions(),
    });
    field(
      grid,
      "status",
      "Status",
      p ? (teacherActive(p) ? "Active" : "Inactive") : "Active",
      {
        options: [
          ["Active", "Active"],
          ["Inactive", "Inactive (left)"],
        ],
      },
    );
    field(grid, "affiliation", "Affiliation", p ? p.affiliation : "BC", {
      maxlength: 12,
      hint: "BC for Braincloud staff, or the school code for school contacts.",
    });
    field(form, "qualification", "Qualification", p?.qualification, {
      maxlength: 300,
    });
    field(form, "braincloud_id", "TMS ID", p?.braincloud_id, {
      type: "number",
      hint: p
        ? "Links this person to TMS. Change only to fix a wrong link."
        : "Enter the person's TMS ID if they are already in TMS; otherwise the sync may later add them a second time.",
    });
    if (!p) {
      const tick = el("label", "", "check-label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.name = "not_in_tms";
      tick.append(box, " This person is not in TMS yet");
      form.append(tick);
    }
    actions(form, dialog);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const original = p
        ? { ...p, status: p.status === "enabled" ? "Active" : p.status }
        : null;
      const { before, changes } = diff(
        form,
        original,
        [
          "firstname_en",
          "lastname_en",
          "nickname_en",
          "firstname_th",
          "lastname_th",
          "nickname_th",
          "user_type",
          "position",
          "status",
          "affiliation",
          "qualification",
          "braincloud_id",
        ],
        ["user_type", "position", "braincloud_id"],
      );
      // "enabled" (from the sync) is shown as Active; compare against the stored value.
      if (p && Object.hasOwn(before, "status")) before.status = p.status;
      if (!Object.keys(changes).length) {
        dialog.close();
        return;
      }
      if (
        !p &&
        !form.elements.braincloud_id.value &&
        !form.elements.not_in_tms.checked
      ) {
        message(
          "Enter the TMS ID, or tick that this person is not in TMS yet.",
          true,
        );
        form.elements.braincloud_id.focus();
        return;
      }
      submit(
        form,
        dialog,
        "/admin/directory/person",
        { user_id: p?.user_id ?? null, before, changes },
        (saved) => {
          const i = st.data.people.findIndex(
            (x) => x.user_id === saved.user_id,
          );
          if (i >= 0) st.data.people[i] = saved;
          else st.data.people.push(saved);
          message(
            p
              ? `Saved ${fullName(saved)}.`
              : `Added ${fullName(saved)} as ${saved.user_id}.`,
          );
        },
      );
    });
    dialog.showModal();
    form.elements[p ? "nickname_en" : "firstname_en"].focus();
  }
  function editSchool(s, prefill = {}) {
    const { dialog, form } = dialogForm(
      s ? `Edit ${s.school_code}` : "Add a school",
    );
    const grid = el("div", "", "form-grid");
    form.append(grid);
    if (!s)
      field(grid, "school_code", "School code", prefill.school_code || "", {
        required: true,
        maxlength: 12,
        hint: prefill.school_code
          ? "The code the timetable uses. It cannot be changed later."
          : "Letters and numbers. It cannot be changed later.",
      });
    else
      form.prepend(
        el("p", `${s.school_id} · code ${s.school_code} (fixed)`, "muted-line"),
      );
    field(grid, "school_name_en", "Name (English)", s?.school_name_en, {
      maxlength: 120,
    });
    field(grid, "school_name_th", "Name (Thai)", s?.school_name_th, {
      maxlength: 120,
    });
    const groups = [
      ...new Set(st.data.schools.map((x) => x.school_group).filter(Boolean)),
    ].sort();
    field(grid, "school_group", "Group", s?.school_group, {
      options: [["", "Not set"], ...groups.map((g) => [g, g])],
    });
    field(grid, "status", "Status", s?.status || "active", {
      options: [
        ["active", "Active"],
        ["inactive", "Inactive"],
      ],
    });
    // Province: type or choose. The 77 map provinces, written the way the
    // directory already writes them where a school uses one ("Chonburi").
    const province = field(grid, "school_province", "Province", "", {
      options: [["", "Not set"]],
    });
    const known = new Map();
    for (const x of st.data.schools)
      if (x.school_province)
        known.set(provinceKey(x.school_province), x.school_province);
    const setProvinces = (names) => {
      const items = new Map();
      for (const name of names)
        items.set(provinceKey(name), known.get(provinceKey(name)) || name);
      if (s?.school_province && !items.has(provinceKey(s.school_province)))
        items.set(provinceKey(s.school_province), s.school_province);
      province.replaceChildren(new Option("Not set", ""));
      for (const name of [...items.values()].sort())
        province.append(new Option(name, name));
      province.value = s?.school_province || "";
      combobox(province, {
        items: [...items.values()].sort().map((name) => ({
          value: name,
          label: name,
        })),
        placeholder: "Type a province",
        emptyText: "No province matches.",
      });
    };
    loadProvinceNames()
      .then(setProvinces)
      .catch(() => setProvinces([...known.values()]));
    field(grid, "school_amphoe", "District (amphoe)", s?.school_amphoe, {
      maxlength: 120,
    });
    field(grid, "learning_model", "Learning model", s?.learning_model, {
      maxlength: 120,
    });
    field(
      grid,
      "braincloud_school_id",
      "TMS school ID",
      s?.braincloud_school_id,
      {
        type: "number",
        hint: "Links the school to TMS so schedules can be matched.",
      },
    );
    // Map location: paste from Google Maps (right-click the school, then
    // click the numbers at the top of the menu to copy them).
    const where = field(
      form,
      "location",
      "Map location (latitude, longitude)",
      s?.latitude != null ? `${s.latitude}, ${s.longitude}` : "",
      {
        hint:
          "In Google Maps, right-click the school and click the numbers at the top to copy them, then paste here." +
          (s?.location_source === "osm"
            ? " Found automatically in OpenStreetMap; check it."
            : ""),
      },
    );
    where.placeholder = "6.41234, 101.80012";
    where.inputMode = "decimal";
    const find = el("a", "Find on Google Maps ↗", "input-hint");
    find.target = "_blank";
    find.rel = "noopener noreferrer";
    const updateFind = () =>
      (find.href = mapsLink({
        name_th: form.elements.school_name_th.value,
        name_en: form.elements.school_name_en.value,
        district: form.elements.school_amphoe.value,
        province: form.elements.school_province.value,
        code: form.elements.school_code?.value || s?.school_code,
      }));
    updateFind();
    form.addEventListener("input", updateFind);
    form.addEventListener("change", updateFind);
    where.closest("label").append(find);
    actions(form, dialog);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const point = parseLocation(where.value);
      if (point === false) {
        where.setCustomValidity(
          "Paste two numbers, latitude then longitude, inside Thailand (for example 6.41234, 101.80012).",
        );
        where.reportValidity();
        return;
      }
      where.setCustomValidity("");
      const { before, changes } = diff(
        form,
        s,
        [
          "school_code",
          "school_name_en",
          "school_name_th",
          "school_group",
          "status",
          "school_province",
          "school_amphoe",
          "learning_model",
          "braincloud_school_id",
        ],
        ["braincloud_school_id"],
      );
      // The location is sent as latitude, longitude and its source.
      const wasLat = s?.latitude ?? null,
        wasLng = s?.longitude ?? null;
      const nowLat = point ? point.latitude : null,
        nowLng = point ? point.longitude : null;
      if (nowLat !== wasLat || nowLng !== wasLng) {
        Object.assign(before, {
          latitude: wasLat,
          longitude: wasLng,
          location_source: s?.location_source ?? null,
        });
        Object.assign(changes, {
          latitude: nowLat,
          longitude: nowLng,
          location_source: point ? "admin" : null,
        });
      }
      if (!Object.keys(changes).length) {
        dialog.close();
        return;
      }
      submit(
        form,
        dialog,
        "/admin/directory/school",
        { school_id: s?.school_id ?? null, before, changes },
        (saved) => {
          const i = st.data.schools.findIndex(
            (x) => x.school_id === saved.school_id,
          );
          if (i >= 0) st.data.schools[i] = saved;
          else st.data.schools.push(saved);
          message(
            s ? `Saved ${saved.school_code}.` : `Added ${saved.school_code}.`,
          );
        },
      );
    });
    dialog.showModal();
    form.elements[s ? "school_name_th" : "school_code"].focus();
  }

  return {
    start() {
      if (!st.data) load();
    },
    clear() {
      st.data = null;
      list.replaceChildren();
      health.replaceChildren();
      count.textContent = "";
    },
  };
}
