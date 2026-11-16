// School coordinators (owner, 16 Nov 2026): every active school and who
// coordinates it, in one list, grouped by school group or by coordinator.
// Type a nickname to change one; tick several schools to set them at once.
// Changes are saved together from one start date, so earlier days keep the
// earlier coordinator (ref_assignment keeps start and end dates).
import { el, button } from "./dom.mjs?v=6b3ed7888e3c";
import { emptyState } from "./characters.mjs?v=6b3ed7888e3c";
import { bangkokDay, groupTone } from "./schedule-model.mjs?v=6b3ed7888e3c";

const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const full = (p) => [p.firstname_en, p.lastname_en].filter(Boolean).join(" ");
const UNASSIGNED = "Unassigned";

// Who coordinates a school on a day: user ids, sorted as the server compares.
export function coordinatorsOn(assignments, school, day) {
  return (assignments || [])
    .filter(
      (a) =>
        a.school_id === school &&
        a.role !== "contact" &&
        a.is_active !== false &&
        (!a.start_date || a.start_date <= day) &&
        (!a.end_date || a.end_date >= day),
    )
    .map((a) => a.user_id)
    .sort();
}

// Names people can type: the nickname when it is unique among Braincloud
// staff, otherwise the full name. People who coordinate already come first.
export function staffNames(people, assignments) {
  const staff = (people || []).filter(
    (p) => String(p.affiliation || "").toUpperCase() === "BC",
  );
  const coordinating = new Set((assignments || []).map((a) => a.user_id));
  const count = new Map();
  for (const p of staff) {
    const n = norm(p.nickname_en || p.firstname_en);
    if (n) count.set(n, (count.get(n) || 0) + 1);
  }
  return staff
    .map((p) => {
      const short = p.nickname_en || p.firstname_en || "";
      return {
        id: p.user_id,
        short,
        full: full(p),
        label:
          short && count.get(norm(short)) === 1
            ? short
            : full(p) || short || p.user_id,
        coordinating: coordinating.has(p.user_id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.coordinating) - Number(a.coordinating) ||
        a.label.localeCompare(b.label),
    );
}

// Typed text -> { id } (null = Unassigned) or { error }.
export function resolveName(text, names) {
  const t = norm(text);
  if (!t || t === norm(UNASSIGNED)) return { id: null };
  const hits = [
    ...new Map(
      names
        .filter((n) =>
          [n.label, n.short, n.full, n.id].some((v) => norm(v) === t),
        )
        .map((n) => [n.id, n]),
    ).values(),
  ];
  if (hits.length === 1) return { id: hits[0].id };
  const already = hits.filter((n) => n.coordinating);
  if (already.length === 1) return { id: already[0].id };
  const said = String(text).trim();
  if (hits.length)
    return {
      error: `Several people are called "${said}". Type the full name.`,
    };
  return {
    error: `No Braincloud staff member called "${said}". Add them under People first.`,
  };
}

export function coordinatorsView({ api, reload, message }) {
  const root = el("section", "", "coord-view");
  root.hidden = true;
  const st = {
    data: null,
    by: "group",
    only: null, // a coordinator label, or UNASSIGNED
    search: "",
    from: bangkokDay(),
    edits: new Map(), // school_id -> typed text
    picked: new Set(),
  };
  let names = [],
    labelOf = new Map(),
    rowsById = new Map();

  // ── Static parts ──
  const intro = el(
    "p",
    "Active schools and who coordinates them. Type a nickname to change one, or tick several schools and set them together. Saved changes start on the date you choose; earlier days keep the earlier coordinator.",
    "input-hint coord-intro",
  );
  const summary = el("div", "", "coord-summary");
  summary.setAttribute("aria-label", "Schools per coordinator");
  const byGroup = button("School group", () => setBy("group"));
  const byPerson = button("Coordinator", () => setBy("person"));
  const by = el("div", "", "segmented");
  by.setAttribute("role", "group");
  by.setAttribute("aria-label", "Group the list by");
  by.append(byGroup, byPerson);
  const byLabel = el("div", "", "coord-by");
  byLabel.append(el("span", "Group by", "coord-by-label"), by);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "cal-search";
  search.placeholder = "Search code, school, province or coordinator";
  search.setAttribute("aria-label", "Search coordinators");
  search.addEventListener("input", () => {
    st.search = norm(search.value);
    renderList();
  });
  const controls = el("div", "", "cal-filters coord-controls");
  controls.append(byLabel, search);
  const datalist = document.createElement("datalist");
  datalist.id = "coord-names";
  const list = el("div", "", "coord-list");

  // Tick several schools, then set one name for all of them.
  const bulk = el("div", "", "coord-bulk");
  bulk.hidden = true;
  const bulkCount = el("strong", "");
  const bulkInput = nameInput("Coordinator for the ticked schools");
  bulkInput.placeholder = "Type a nickname";
  const bulkApply = button("Set for ticked schools", () => {
    for (const id of st.picked) st.edits.set(id, bulkInput.value);
    st.picked.clear();
    bulkInput.value = "";
    renderList();
  });
  const bulkClear = button("Clear ticks", () => {
    st.picked.clear();
    renderList();
  });
  bulk.append(bulkCount, bulkInput, bulkApply, bulkClear);

  // Pending changes: one start date, one Save.
  const bar = el("div", "", "coord-save");
  bar.hidden = true;
  const barText = el("strong", "");
  const barError = el("span", "", "coord-error");
  const fromLabel = el("label", "Starts on", "coord-from");
  const from = document.createElement("input");
  from.type = "date";
  from.value = st.from;
  from.addEventListener("change", () => {
    if (!from.value) from.value = bangkokDay();
    st.from = from.value;
    renderList();
  });
  fromLabel.append(from);
  const undo = button("Undo changes", () => {
    st.edits.clear();
    st.picked.clear();
    renderList();
  });
  const save = button("Save changes", saveChanges, "");
  bar.append(barText, barError, fromLabel, undo, save);

  root.append(intro, summary, controls, datalist, bulk, list, bar);

  function nameInput(label) {
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("list", "coord-names");
    input.setAttribute("aria-label", label);
    input.placeholder = UNASSIGNED;
    input.autocomplete = "off";
    input.className = "coord-input";
    return input;
  }
  function setBy(value) {
    st.by = value;
    renderList();
  }

  // ── Derived state ──
  const schools = () =>
    (st.data?.schools || [])
      .filter((s) => String(s.status || "").toLowerCase() === "active")
      .sort((a, b) => String(a.school_code).localeCompare(b.school_code));
  const currentIds = (s) =>
    coordinatorsOn(st.data.assignments, s.school_id, st.from);
  const currentLabel = (s) =>
    currentIds(s)
      .map((id) => labelOf.get(id) || id)
      .join(", ");
  // One school's pending change: null when nothing changes.
  function pending(s) {
    if (!st.edits.has(s.school_id)) return null;
    const typed = st.edits.get(s.school_id);
    const result = resolveName(typed, names);
    if (result.error) return { error: result.error };
    const was = currentIds(s).join(",");
    if ((result.id || "") === was) return null;
    return {
      school_id: s.school_id,
      user_id: result.id,
      before_user_id: was || null,
    };
  }

  // ── Render ──
  function render(data) {
    st.data = data;
    names = staffNames(data.people, data.assignments);
    labelOf = new Map(names.map((n) => [n.id, n.label]));
    datalist.replaceChildren(
      ...names.map((n) => {
        const o = document.createElement("option");
        o.value = n.label;
        if (n.full && n.full !== n.label) o.label = n.full;
        return o;
      }),
    );
    renderList();
  }

  function renderSummary(all) {
    const counts = new Map();
    for (const s of all) {
      const who = currentLabel(s) || UNASSIGNED;
      counts.set(who, (counts.get(who) || 0) + 1);
    }
    const order = [...counts.entries()].sort(
      (a, b) =>
        Number(a[0] === UNASSIGNED) - Number(b[0] === UNASSIGNED) ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    );
    summary.replaceChildren(
      ...order.map(([who, n]) => {
        const chip = button(
          "",
          () => {
            st.only = st.only === who ? null : who;
            renderList();
          },
          "coord-chip",
        );
        chip.append(el("span", who, "coord-chip-name"), el("b", String(n)));
        if (who === UNASSIGNED) chip.dataset.empty = "true";
        chip.setAttribute("aria-pressed", String(st.only === who));
        chip.title =
          st.only === who ? "Show every school" : `Show only ${who}'s schools`;
        return chip;
      }),
    );
  }

  function visible(all) {
    return all.filter((s) => {
      const who = currentLabel(s);
      if (st.only && (who || UNASSIGNED) !== st.only) return false;
      if (!st.search) return true;
      return norm(
        [
          s.school_code,
          s.school_name_th,
          s.school_name_en,
          s.school_province,
          s.school_group,
          who,
          st.edits.get(s.school_id),
        ].join(" "),
      ).includes(st.search);
    });
  }

  function renderList() {
    if (!st.data) return;
    byGroup.setAttribute("aria-pressed", String(st.by === "group"));
    byPerson.setAttribute("aria-pressed", String(st.by === "person"));
    const all = schools();
    renderSummary(all);
    const shown = visible(all);
    rowsById = new Map();
    list.replaceChildren();
    if (!shown.length) {
      list.append(emptyState("No school matches.", "boy-confused"));
    } else {
      const groups = new Map();
      for (const s of shown) {
        const key =
          st.by === "group"
            ? s.school_group || "No group"
            : currentLabel(s) || UNASSIGNED;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      const keys = [...groups.keys()].sort(
        (a, b) =>
          Number(b === UNASSIGNED) - Number(a === UNASSIGNED) ||
          groups.get(b).length - groups.get(a).length ||
          a.localeCompare(b),
      );
      for (const key of keys) list.append(section(key, groups.get(key)));
    }
    refreshBars();
  }

  function section(key, items) {
    const box = el("section", "", "coord-group");
    const head = el("div", "", "coord-group-head");
    const pickAll = document.createElement("input");
    pickAll.type = "checkbox";
    pickAll.setAttribute("aria-label", `Tick every school in ${key}`);
    pickAll.checked = items.every((s) => st.picked.has(s.school_id));
    pickAll.addEventListener("change", () => {
      for (const s of items)
        if (pickAll.checked) st.picked.add(s.school_id);
        else st.picked.delete(s.school_id);
      for (const s of items) {
        const r = rowsById.get(s.school_id);
        if (r) r.pick.checked = pickAll.checked;
      }
      refreshBars();
    });
    const title = el("h3", "");
    if (st.by === "group") {
      const chip = el("span", key, "group-chip");
      chip.dataset.tone = groupTone(key);
      title.append(chip);
    } else title.append(el("span", key));
    title.append(
      " ",
      el(
        "span",
        `${items.length} ${items.length === 1 ? "school" : "schools"}`,
        "coord-n",
      ),
    );
    head.append(pickAll, title);
    box.append(head, ...items.map(row));
    return box;
  }

  function row(s) {
    const line = el("div", "", "coord-row");
    const pick = document.createElement("input");
    pick.type = "checkbox";
    pick.checked = st.picked.has(s.school_id);
    pick.setAttribute("aria-label", `Tick ${s.school_code}`);
    pick.addEventListener("change", () => {
      if (pick.checked) st.picked.add(s.school_id);
      else st.picked.delete(s.school_id);
      refreshBars();
    });
    const info = el("div", "", "coord-school");
    const code = el("span", s.school_code, "group-chip");
    code.dataset.tone = groupTone(s.school_group);
    info.append(
      code,
      " ",
      el("strong", s.school_name_th || s.school_name_en || ""),
      el(
        "span",
        [s.school_name_th ? s.school_name_en : "", s.school_province]
          .filter(Boolean)
          .join(" · "),
        "directory-sub",
      ),
    );
    const who = el("div", "", "coord-who");
    const input = nameInput(`Coordinator for ${s.school_code}`);
    const now = currentLabel(s);
    input.value = st.edits.has(s.school_id) ? st.edits.get(s.school_id) : now;
    const hint = el("small", "", "coord-hint");
    who.append(input, hint);
    input.addEventListener("input", () => {
      if (norm(input.value) === norm(now)) st.edits.delete(s.school_id);
      else st.edits.set(s.school_id, input.value);
      mark();
      refreshBars();
    });
    function mark() {
      const p = pending(s);
      line.dataset.state = p?.error ? "error" : p ? "changed" : "";
      input.setAttribute("aria-invalid", String(!!p?.error));
      hint.textContent = p?.error
        ? p.error
        : p
          ? `Was ${now || UNASSIGNED}`
          : "";
    }
    mark();
    line.append(pick, info, who);
    rowsById.set(s.school_id, { pick, input, mark });
    return line;
  }

  function refreshBars() {
    const all = schools();
    const changes = all.map(pending).filter(Boolean);
    const errors = changes.filter((c) => c.error);
    bar.hidden = !changes.length;
    barText.textContent = `${changes.length} ${changes.length === 1 ? "change" : "changes"}`;
    barError.textContent = errors.length
      ? `Fix ${errors.length} ${errors.length === 1 ? "name" : "names"} first.`
      : "";
    save.disabled = !!errors.length || !changes.length;
    bulk.hidden = !st.picked.size;
    bulkCount.textContent = `${st.picked.size} ticked`;
  }

  async function saveChanges() {
    const changes = schools().map(pending).filter(Boolean);
    if (!changes.length || changes.some((c) => c.error)) return;
    save.disabled = true;
    save.setAttribute("aria-busy", "true");
    try {
      const { data } = await api("/admin/directory/coordinators", {
        method: "POST",
        data: { from: st.from, changes },
      });
      st.edits.clear();
      st.picked.clear();
      message(
        `Saved ${data?.changed ?? changes.length} ${changes.length === 1 ? "coordinator" : "coordinators"}, starting ${st.from}.`,
      );
      await reload();
    } catch (error) {
      message(error.message, true);
      refreshBars();
    } finally {
      save.removeAttribute("aria-busy");
    }
  }

  return {
    root,
    render,
    // Unsaved edits survive switching views, not signing out.
    clear() {
      st.data = null;
      st.edits.clear();
      st.picked.clear();
      list.replaceChildren();
      summary.replaceChildren();
      refreshBars();
    },
  };
}
