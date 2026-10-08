// Team calendar in the administrator workspace: who is away and which schools
// are closed, with the server's check of whether each affected class is
// already cancelled or covered. One request per month; the day panel works
// from the same data.
import { el, button, modal } from "./dom.mjs?v=45e5b57cfced";
import { character, emptyState } from "./characters.mjs?v=45e5b57cfced";
import { rise, punch } from "./motion.mjs?v=45e5b57cfced";
import {
  bangkokDay,
  cancelled,
  category,
  confirmedSessions,
  time,
} from "./schedule-model.mjs?v=45e5b57cfced";

const TONES = [
  ["thesaban", "Thesaban"],
  ["private", "Private"],
  ["obec3", "OBEC 3"],
  ["obecsouth", "OBEC South"],
  ["other", "Other"],
];
const STATE = {
  needs_action: "Needs action",
  handled: "Handled",
  confirmed: "Handled · confirmed",
  no_sessions: "No classes recorded",
  past: "Past · not resolved",
};
const CLASS_STATE = {
  cancelled: "Cancelled",
  covered: "Covered",
  uncovered: "Not covered",
  active: "Still scheduled",
};
const plural = (n, word) => (n === 1 ? word : word + "s");
const addDays = (d, n) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const weekday = (d) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
const longDate = (d, opts = {}) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...opts,
  });
const monthLabel = (m) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
const shiftMonth = (m, n) => {
  const d = new Date(m + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
function monthRange(m) {
  const first = m + "-01",
    last = addDays(shiftMonth(m, 1) + "-01", -1);
  return {
    start: addDays(first, -weekday(first)),
    end: addDays(last, 6 - weekday(last)),
  };
}
const statePill = (state) => {
  const pill = el("span", STATE[state] || state, "state-pill");
  pill.dataset.state = state;
  return pill;
};
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const transition = (update) => {
  if (!document.startViewTransition || reduced()) return update();
  const view = document.startViewTransition(update);
  // A skipped transition (the window resized or rotated mid-way) still runs
  // the update; only the animation is lost, so the rejection is expected.
  view.ready.catch(() => {});
  view.finished.catch(() => {});
};

// One calendar for two audiences: administrators (editing, reasons) and staff
// (read-only, company Google sign-in, no reasons; see publicCalendar).
export function initializeAdminCalendar({
  api,
  query,
  message,
  rootId = "calendar-root",
  endpoint = "/admin/calendar",
  readOnly = false,
  // Signed-in administrators: what their permissions allow.
  canEdit = () => !readOnly,
  canSeeDetails = () => !readOnly,
  // Whether the page holding the calendar is on screen (for auto-refresh).
  isVisible = () =>
    !document.getElementById("admin-workspace").hidden &&
    !document.getElementById("admin").hidden,
}) {
  const root = document.getElementById(rootId);
  const st = {
    month: bangkokDay().slice(0, 7),
    data: null,
    show: "all",
    tones: new Set(),
    needsOnly: false,
    search: "",
    view: matchMedia("(max-width: 700px)").matches ? "list" : "month",
    generation: 0,
    loadedAt: null,
    openDay: null,
    users: null,
  };
  let onEdit = () => {};

  // ── Toolbar and filters ──
  const title = el("h3", monthLabel(st.month), "cal-title");
  title.setAttribute("aria-live", "polite");
  const prev = button("‹", () => go(-1), "secondary cal-arrow");
  prev.setAttribute("aria-label", "Previous month");
  const next = button("›", () => go(1), "secondary cal-arrow");
  next.setAttribute("aria-label", "Next month");
  const todayButton = button("Today", () => {
    st.month = bangkokDay().slice(0, 7);
    load(true);
  });
  const refresh = button("Refresh", () => load(), "secondary");
  const viewButtons = ["month", "list"].map((v) => {
    const b = button(v === "month" ? "Month" : "List", () => {
      st.view = v;
      transition(render);
    });
    b.dataset.view = v;
    return b;
  });
  const viewGroup = el("div", "", "segmented");
  viewGroup.setAttribute("role", "group");
  viewGroup.setAttribute("aria-label", "Calendar view");
  viewGroup.append(...viewButtons);
  const showButtons = [
    ["all", "All"],
    ["School", "Schools"],
    ["Teacher", "Teachers"],
  ].map(([value, label]) => {
    const b = button(label, () => {
      st.show = value;
      render();
    });
    b.dataset.show = value;
    return b;
  });
  const showGroup = el("div", "", "segmented");
  showGroup.setAttribute("role", "group");
  showGroup.setAttribute("aria-label", "Show");
  showGroup.append(...showButtons);
  const toneButtons = TONES.map(([tone, label]) => {
    const b = button(
      label,
      () => {
        st.tones.has(tone) ? st.tones.delete(tone) : st.tones.add(tone);
        render();
      },
      "tone-filter",
    );
    b.dataset.tone = tone;
    return b;
  });
  const toneGroup = el("div", "", "tone-filters");
  toneGroup.setAttribute("role", "group");
  toneGroup.setAttribute("aria-label", "School groups");
  toneGroup.append(...toneButtons);
  const needsLabel = el("label", "", "check-label needs-toggle");
  const needsBox = document.createElement("input");
  needsBox.type = "checkbox";
  needsBox.addEventListener("change", () => {
    st.needsOnly = needsBox.checked;
    render();
  });
  needsLabel.append(needsBox, " Needs action only");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search school or teacher";
  search.setAttribute("aria-label", "Search the calendar");
  search.className = "cal-search";
  search.addEventListener("input", () => {
    st.search = search.value.trim().toLowerCase();
    render();
  });
  const status = el("p", "", "cal-status");
  status.setAttribute("role", "status");
  const body = el("div", "", "cal-body");
  const nav = el("div", "", "cal-nav");
  nav.append(prev, title, next, todayButton);
  const toolbar = el("div", "", "cal-toolbar");
  toolbar.append(nav, viewGroup, refresh);
  const filters = el("div", "", "cal-filters");
  filters.append(showGroup, toneGroup, needsLabel, search);
  root.append(toolbar, filters, status, body);

  function go(n) {
    st.month = shiftMonth(st.month, n);
    load(true);
  }

  // ── Data ──
  async function load(animate = false) {
    const generation = ++st.generation,
      { start, end } = monthRange(st.month);
    title.textContent = monthLabel(st.month);
    status.textContent = "Loading the calendar…";
    body.classList.add("is-loading");
    try {
      const { data } = await api(endpoint, {
        method: "POST",
        data: { start, end },
      });
      if (generation !== st.generation) return;
      st.data = data;
      st.loadedAt = new Date();
      animate ? transition(render) : render();
      if (st.openDay) renderDay(st.openDay.date, st.openDay);
    } catch (error) {
      if (generation !== st.generation) return;
      body.classList.remove("is-loading");
      status.textContent = "";
      const retry = button("Try again", () => load());
      const box = emptyState(
        "The calendar could not be loaded. " + error.message,
        "robot-r-confused",
      );
      box.append(retry);
      body.replaceChildren(box);
    }
  }

  // ── Filtering ──
  const matches = (r) =>
    (st.show === "all" || r.category === st.show) &&
    (!st.tones.size || (r.category === "School" && st.tones.has(r.tone))) &&
    (!st.search ||
      [
        r.school_code,
        r.school_name,
        r.teacher_name,
        r.teacher_nickname,
        r.group,
      ]
        .join(" ")
        .toLowerCase()
        .includes(st.search));
  const dayOf = (r, date) => r.days.find((d) => d.date === date);
  const needs = (r, date) =>
    r.state !== "confirmed" && dayOf(r, date)?.state === "needs_action";
  function requestsOn(date) {
    if (!st.data) return [];
    return st.data.requests.filter(
      (r) => matches(r) && dayOf(r, date) && (!st.needsOnly || needs(r, date)),
    );
  }
  function summarise(date) {
    const list = requestsOn(date);
    const schools = new Map(),
      teachers = new Set();
    for (const r of list)
      if (r.category === "School") schools.set(r.school_code, r.tone);
      else teachers.add(r.teacher_id);
    const tones = {};
    for (const tone of schools.values()) tones[tone] = (tones[tone] || 0) + 1;
    return {
      list,
      schools: schools.size,
      teachers: teachers.size,
      tones,
      needs: list.filter((r) => needs(r, date)).length,
    };
  }
  function toneBar(tones, total) {
    const bar = el("span", "", "tone-bar");
    bar.setAttribute("aria-hidden", "true");
    for (const [tone] of TONES)
      if (tones[tone]) {
        const seg = el("span", "", "tone-seg");
        seg.dataset.tone = tone;
        seg.style.flexGrow = String(tones[tone]);
        bar.append(seg);
      }
    bar.style.setProperty("--fill", String(Math.min(1, total / 12)));
    return bar;
  }
  function dayLabel(date, s) {
    return [
      longDate(date, { weekday: "long", month: "long" }),
      s.schools ? `${s.schools} ${plural(s.schools, "school")} closed` : "",
      s.teachers
        ? `${s.teachers} ${plural(s.teachers, "teacher")} on leave`
        : "",
      s.needs ? `${s.needs} need action` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }

  // ── Month and list views ──
  function render() {
    body.classList.remove("is-loading");
    for (const b of viewButtons)
      b.setAttribute("aria-pressed", String(b.dataset.view === st.view));
    for (const b of showButtons)
      b.setAttribute("aria-pressed", String(b.dataset.show === st.show));
    for (const b of toneButtons)
      b.setAttribute("aria-pressed", String(st.tones.has(b.dataset.tone)));
    if (!st.data) return;
    const today = bangkokDay();
    const { start, end } = monthRange(st.month);
    let needTotal = 0;
    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const s = summarise(d);
      if (d.startsWith(st.month) && d >= today) needTotal += s.needs;
      days.push([d, s]);
    }
    status.textContent = `Updated ${st.loadedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} · ${
      needTotal
        ? `${needTotal} still need action from today`
        : "Nothing needs action from today"
    }`;
    const view =
      st.view === "month" ? monthView(days, today) : listView(days, today);
    body.replaceChildren(view);
    rise(view.querySelectorAll(".cal-day, .agenda-day"));
  }
  function monthView(days, today) {
    const grid = el("div", "", "cal-grid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", monthLabel(st.month));
    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const h = el("span", name, "cal-weekday");
      h.setAttribute("role", "columnheader");
      grid.append(h);
    }
    days.forEach(([date, s], i) => {
      const cell = button("", () => openDay(date), "cal-day");
      cell.style.setProperty("--i", String(Math.min(i % 7, 6)));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", dayLabel(date, s));
      if (!date.startsWith(st.month)) cell.classList.add("is-out");
      if (date === today) cell.classList.add("is-today");
      if (weekday(date) > 4) cell.classList.add("is-weekend");
      if (s.needs) cell.classList.add("has-needs");
      const num = el("span", String(Number(date.slice(8))), "cal-date");
      cell.append(num);
      if (s.schools) {
        cell.append(toneBar(s.tones, s.schools));
        cell.append(
          el(
            "span",
            `${s.schools} school${s.schools > 1 ? "s" : ""}`,
            "cal-count",
          ),
        );
      }
      if (s.teachers)
        cell.append(
          el("span", `${s.teachers} on leave`, "cal-count is-teacher"),
        );
      if (s.needs) {
        const dot = el("span", String(s.needs), "cal-needs");
        dot.setAttribute("aria-hidden", "true");
        cell.append(dot);
      }
      grid.append(cell);
    });
    return grid;
  }
  function listView(days, today) {
    const list = el("div", "", "agenda");
    const shown = days.filter(
      ([date, s]) => date.startsWith(st.month) && (s.schools || s.teachers),
    );
    if (!shown.length)
      return emptyState(
        "No leave or school closures match this month and these filters.",
        "boy-neutral",
      );
    for (const [date, s] of shown) {
      const row = button("", () => openDay(date), "agenda-day");
      row.setAttribute("aria-label", dayLabel(date, s));
      if (date === today) row.classList.add("is-today");
      if (date < today) row.classList.add("is-past");
      if (s.needs) row.classList.add("has-needs");
      const when = el("span", "", "agenda-date");
      when.append(
        el("strong", String(Number(date.slice(8)))),
        el("span", longDate(date, { day: undefined, month: undefined })),
      );
      const what = el("span", "", "agenda-what");
      if (s.schools) {
        what.append(toneBar(s.tones, s.schools));
        what.append(
          el("span", `${s.schools} ${plural(s.schools, "school")} closed`),
        );
      }
      if (s.teachers)
        what.append(
          el("span", `${s.teachers} ${plural(s.teachers, "teacher")} on leave`),
        );
      row.append(when, what);
      if (s.needs)
        row.append(el("span", `${s.needs} need action`, "cal-needs is-label"));
      list.append(row);
    }
    return list;
  }

  // ── Day panel ──
  function openDay(date) {
    const { dialog, body: content } = modal(
      longDate(date, { weekday: "long", month: "long", year: "numeric" }),
    );
    dialog.classList.add("day-sheet");
    st.openDay = { date, dialog, content };
    dialog.addEventListener("close", () => {
      if (st.openDay?.dialog === dialog) st.openDay = null;
    });
    renderDay(date, st.openDay);
    dialog.showModal();
  }
  function renderDay(date, { content }) {
    const s = summarise(date),
      today = bangkokDay();
    content.replaceChildren();
    const head = el("div", "", "day-head");
    head.append(
      el(
        "p",
        [
          `${s.schools} school${s.schools === 1 ? "" : "s"} closed`,
          `${s.teachers} teacher${s.teachers === 1 ? "" : "s"} on leave`,
          s.needs ? `${s.needs} need action` : "nothing needs action",
        ].join(" · "),
        "day-summary",
      ),
    );
    const actions = el("div", "", "toolbar");
    actions.append(
      button("Copy daily update", () => copyDailyUpdate(date)),
      button("Open day timeline", () => {
        const form = document.getElementById("daily-form");
        form.elements.date.value = date;
        st.openDay?.dialog.close();
        location.hash = "operations";
        form.requestSubmit();
      }),
    );
    head.append(actions);
    content.append(head);
    if (!s.list.length) {
      content.append(
        emptyState(
          "No leave or school closures recorded for this day.",
          "boy-neutral",
        ),
      );
      return;
    }
    if (!s.needs && date >= today) {
      const ok = el("div", "", "all-handled");
      ok.append(
        character("girl-thumbs", { small: true }),
        el(
          "p",
          "Everything on this day is handled: affected classes are cancelled or covered.",
        ),
      );
      content.append(ok);
    }
    const needing = s.list.filter((r) => needs(r, date));
    const rest = s.list.filter((r) => !needs(r, date));
    if (needing.length) {
      content.append(el("h3", "Needs action", "day-section needs"));
      // Teachers first: their classes need a cover decision.
      for (const r of needing.filter((x) => x.category === "Teacher"))
        content.append(requestCard(r, date));
      toneGroups(
        needing.filter((x) => x.category === "School"),
        date,
        content,
      );
    }
    const teachers = rest.filter((r) => r.category === "Teacher");
    if (teachers.length) {
      content.append(el("h3", "Teachers on leave", "day-section"));
      for (const r of teachers) content.append(requestCard(r, date));
    }
    const schools = rest.filter((r) => r.category === "School");
    if (schools.length) {
      content.append(el("h3", "School closures", "day-section"));
      toneGroups(schools, date, content);
    }
    rise(content.querySelectorAll(".request-card"));
  }
  // School cards grouped by colour family; large groups start collapsed.
  function toneGroups(schools, date, content) {
    for (const [tone, label] of TONES) {
      const group = schools.filter((r) => r.tone === tone);
      if (!group.length) continue;
      const box = el("details", "", "tone-group");
      box.dataset.tone = tone;
      box.open = group.length <= 8;
      const chip = el("span", label, "group-chip");
      chip.dataset.tone = tone;
      const summary = el("summary", "");
      summary.append(
        chip,
        ` ${group.length} school${group.length > 1 ? "s" : ""}`,
      );
      box.append(summary);
      for (const r of group) box.append(requestCard(r, date, true));
      content.append(box);
    }
  }
  function requestCard(r, date, compact = false) {
    const day = r.days.find((d) => d.date === date);
    const card = el(
      "article",
      "",
      "request-card" + (compact ? " is-compact" : ""),
    );
    card.dataset.state = r.state === "confirmed" ? "confirmed" : day.state;
    const heading = el("div", "", "request-card-head");
    if (r.category === "Teacher") {
      const name = el(
        "strong",
        r.teacher_name + (r.teacher_nickname ? ` (${r.teacher_nickname})` : ""),
      );
      heading.append(name);
      if (r.teacher_type)
        heading.append(" ", el("span", r.teacher_type, "type-tag"));
    } else {
      const chip = el("span", r.school_code || "?", "group-chip");
      chip.dataset.tone = r.tone;
      heading.append(chip, " ", el("strong", r.school_name || ""));
    }
    heading.append(
      statePill(r.state === "confirmed" ? "confirmed" : day.state),
    );
    card.append(heading);
    const span =
      r.start_date === r.end_date
        ? ""
        : ` · day ${Math.round((Date.parse(date) - Date.parse(r.start_date)) / 86400000) + 1} of ${Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 86400000) + 1}`;
    const what =
      r.category === "Teacher"
        ? `${r.type === "Leave" ? "Leave" : r.type + " leave"} · ${r.times ? `${r.times.start}–${r.times.end}` : "Full day"}${span}`
        : `${r.partial ? `${day.total} selected classes` : "Whole day"}${span}`;
    card.append(el("p", what, "request-what"));
    if (r.category === "Teacher") {
      if (!day.classes.length)
        card.append(el("p", "No classes recorded in this time.", "muted-line"));
      const list = el("ul", "", "class-list");
      for (const c of day.classes) {
        const li = el("li", "", "class-row");
        li.dataset.state = c.state;
        li.append(
          el("span", c.time, "class-time"),
          el("span", `${c.class_name} · ${c.school_code}`, "class-name"),
          el(
            "span",
            c.state === "covered"
              ? `Covered by ${c.cover}`
              : CLASS_STATE[c.state],
            "class-state",
          ),
        );
        if (c.state === "uncovered" && date >= bangkokDay()) {
          const slot = el("div", "", "cover-slot");
          li.append(
            button(
              "Suggest cover",
              () => suggest(r, c, date, slot),
              "secondary small",
            ),
            slot,
          );
        }
        list.append(li);
      }
      if (day.classes.length) card.append(list);
      if (day.unavailability === false)
        card.append(
          el("p", "Not yet in the TMS unavailability list.", "muted-line"),
        );
    } else if (day.open) {
      card.append(
        el(
          "p",
          `${day.open} of ${day.total} classes still scheduled: ${day.classes.map((c) => `${c.class_name} ${c.time}`).join(", ")}`,
          "attention-line",
        ),
      );
    } else if (day.total)
      card.append(el("p", `All ${day.total} classes cancelled.`, "muted-line"));
    if (canSeeDetails() && (!compact || r.reason)) {
      const meta = el("p", "", "request-meta");
      meta.append(
        `#${r.id} · ${r.user_name || "Not recorded"} · ${r.verified ? "LINE verified" : "Browser, not verified"}`,
      );
      if (r.reason)
        meta.append(el("span", ` · “${r.reason}”`, "request-reason"));
      card.append(meta);
    }
    const tools = el("div", "", "request-tools");
    if (readOnly) {
      // Changing a request needs administrator access (Admin page).
      const signIn = el(
        "a",
        "Edit in Admin",
        "button-link secondary-link small",
      );
      signIn.href = "#admin";
      tools.append(signIn);
      card.append(tools);
      return card;
    }
    if (!canEdit()) return card;
    const confirmed = r.state === "confirmed";
    tools.append(
      button(
        confirmed ? "Undo handled" : "Mark handled",
        (event) => setHandled(r, !confirmed, event.currentTarget),
        "secondary small",
      ),
      button("Edit", () => edit(r.id), "secondary small"),
    );
    card.append(tools);
    return card;
  }
  async function setHandled(r, handled, control) {
    control.disabled = true;
    try {
      await api(`/admin/requests/${r.id}/handled`, {
        method: "POST",
        data: { handled },
      });
      message(
        handled
          ? `Request #${r.id} marked as handled.`
          : `Request #${r.id} is open again.`,
      );
      await load();
      punch(st.openDay?.content);
    } catch (error) {
      message(error.message, true);
      control.disabled = false;
    }
  }
  async function edit(id) {
    try {
      const { data } = await api("/admin/query", {
        method: "POST",
        data: {
          table: "requests_log",
          filters: [{ column: "id", op: "eq", value: id }],
          limit: 1,
        },
      });
      if (!data[0]) throw new Error("Record not found.");
      onEdit(data[0]);
    } catch (error) {
      message(error.message, true);
    }
  }
  async function suggest(r, c, date, slot) {
    slot.replaceChildren(el("p", "Finding available teachers…", "muted-line"));
    try {
      const { data } = await api("/cover/options", {
        method: "POST",
        data: { date, session_id: c.session_id, proposals: [] },
      });
      slot.replaceChildren();
      if (!data.length) {
        slot.append(
          el(
            "p",
            "No available teacher found in the recorded schedule.",
            "muted-line",
          ),
        );
        return;
      }
      const list = el("ol", "", "cover-list");
      for (const option of data.slice(0, 5)) {
        const li = el("li", "");
        li.append(
          el("strong", option.name),
          " ",
          el("span", option.type, "type-tag"),
          el(
            "span",
            ` · ${option.workload ? `${option.workload} other classes` : "no other classes"}`,
            "muted-line",
          ),
          button(
            "Copy message",
            async () => {
              await navigator.clipboard.writeText(
                `Cover request · ${longDate(date, { year: "numeric" })} · ${c.time} ${c.class_name} (${c.school_code}) · for ${r.teacher_name} → ${option.name}?`,
              );
              message("Cover message copied.");
            },
            "secondary small",
          ),
        );
        list.append(li);
      }
      slot.append(
        list,
        el(
          "p",
          "Suggestions only. Confirm with the teacher, then record the cover in TMS.",
          "muted-line",
        ),
      );
      rise(list.children);
    } catch (error) {
      slot.replaceChildren(el("p", error.message, "attention-line"));
    }
  }
  // Same text the team used to paste into the daily email.
  async function copyDailyUpdate(date) {
    try {
      const [rawSessions, schools] = await Promise.all([
        query("fact_daily_session", [
          { column: "date", op: "eq", value: date },
        ]),
        query("dim_school"),
      ]);
      // Ignore classes removed from TMS after they were first seen.
      const sessions = confirmedSessions(rawSessions);
      st.users ||= await query("dim_user");
      const codeOf = new Map(
        schools.map((s) => [String(s.school_id), s.school_code]),
      );
      const nameOf = new Map(
        st.users.map((u) => [
          String(u.user_id).trim(),
          [u.firstname_en, u.lastname_en].filter(Boolean).join(" ") ||
            u.nickname_en ||
            `T.${u.user_id}`,
        ]),
      );
      const covers = sessions
        .filter((s) => !cancelled(s) && category(s) === "covered")
        .sort((a, b) => time(a.start_time).localeCompare(time(b.start_time)))
        .map(
          (s) =>
            `${time(s.start_time)} - ${time(s.end_time)} ${s.class_name} - ${nameOf.get(String(s.actual_teacher_id).trim()) || s.actual_teacher_id || "Unknown"}`,
        );
      const bySchool = new Map();
      for (const s of sessions) {
        const code = codeOf.get(String(s.school_id)) || "Unknown";
        if (!bySchool.has(code)) bySchool.set(code, { total: 0, off: [] });
        const entry = bySchool.get(code);
        entry.total++;
        if (cancelled(s)) entry.off.push(s.class_name);
      }
      const cancellations = [...bySchool.keys()]
        .sort()
        .filter((code) => bySchool.get(code).off.length)
        .map((code) => {
          const { total, off } = bySchool.get(code);
          return off.length === total
            ? `- ${code}`
            : `- ${code} (${[...new Set(off)].sort().join(", ")})`;
        });
      const now = new Date().toLocaleTimeString("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
      });
      const day = new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      await navigator.clipboard.writeText(
        [
          `Subject: Updated(${now})_Cover and Class cancellation_${day}`,
          "",
          "New_Class cover today",
          ...(covers.length ? covers : ["- None -"]),
          "",
          "Class cancellation.",
          ...(cancellations.length ? cancellations : ["- None -"]),
        ].join("\n"),
      );
      message("Daily update copied. Paste it into the email.");
    } catch (error) {
      message(error.message || "The daily update could not be copied.", true);
    }
  }

  // Refresh quietly every two minutes while visible.
  setInterval(() => {
    if (st.data && !document.hidden && isVisible()) load();
  }, 120000);

  return {
    start() {
      if (!st.data) load(true);
    },
    refresh: () => load(),
    clear() {
      st.data = null;
      st.generation++;
      st.openDay?.dialog.close();
      body.replaceChildren();
      status.textContent = "";
    },
    onEdit(handler) {
      onEdit = handler;
    },
    // Open one day (deep link from the leave email): load its month first.
    async openDate(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
      if (st.month !== date.slice(0, 7) || !st.data) {
        st.month = date.slice(0, 7);
        await load();
      }
      if (st.data) openDay(date);
    },
  };
}
