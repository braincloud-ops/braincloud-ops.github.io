import { el, button } from "./dom.mjs?v=fcb540a8dcd9";
import { emptyState } from "./characters.mjs?v=fcb540a8dcd9";
import { rise } from "./motion.mjs?v=fcb540a8dcd9";
import {
  bangkokDay,
  time,
  category,
  cancelled,
  inProgress,
  leaveOverlaps,
  decorateSessions,
  confirmedSessions,
  displayName,
  teacherType,
  statusLabel,
  groupTone,
} from "./schedule-model.mjs?v=fcb540a8dcd9";

export function sessionCard(s) {
  const card = el("article", "", "session-card");
  card.dataset.status = category(s);
  const head = el("div", "", "session-card-heading");
  head.append(
    el("h3", s.class_name || "Class"),
    el("span", statusLabel(s), "class-badge"),
  );
  card.append(head, el("p", s.school, "session-school"));
  const clock = el(
    "p",
    `${time(s.start_time)}–${time(s.end_time)}`,
    "session-time",
  );
  if (inProgress(s))
    clock.append(el("span", "In progress", "class-badge live"));
  const teacher = el("p", s.teacher, "session-teacher");
  if (s.teacherType && s.teacherType !== "Other")
    teacher.append(" ", el("span", s.teacherType, "type-tag"));
  card.append(clock, teacher);
  if (category(s) === "covered")
    card.append(el("p", `Cover for: ${s.original}`, "cover-for"));
  const meta = el("p", "", "session-meta");
  const group = el("span", s.group, "group-chip");
  group.dataset.tone = groupTone(s.group);
  meta.append(group, ` · Coordinator: ${s.coordinator}`);
  card.append(meta);
  return card;
}

export function initializeDashboard({ query }) {
  const root = document.getElementById("dashboard");
  const date = root.querySelector("[name=date]");
  date.value = bangkokDay();
  const note = document.getElementById("dashboard-note"),
    metrics = document.getElementById("dashboard-metrics"),
    results = document.getElementById("dashboard-results");
  const view = document.getElementById("dashboard-view"),
    mode = document.getElementById("dashboard-filter-mode"),
    filter = document.getElementById("dashboard-filter");
  let snapshot,
    pending = 0,
    status = "all",
    initialized = false,
    lastKey = null;
  const counts = (rows) => ({
    all: rows.length,
    live: rows.filter((s) => inProgress(s)).length,
    covered: rows.filter((s) => category(s) === "covered").length,
    "school-cancelled": rows.filter((s) => category(s) === "school-cancelled")
      .length,
    "bc-cancelled": rows.filter((s) => category(s) === "bc-cancelled").length,
    cancelled: rows.filter((s) => category(s) === "cancelled").length,
  });
  function choices() {
    const previous = filter.value;
    filter.replaceChildren(new Option("All", ""));
    for (const value of [
      ...new Set(
        snapshot.rows.flatMap((s) =>
          mode.value === "teacher" ? [s.teacher, s.original] : [s[mode.value]],
        ),
      ),
    ].sort())
      filter.append(new Option(value, value));
    if ([...filter.options].some((o) => o.value === previous))
      filter.value = previous;
  }
  function render() {
    if (!snapshot) return;
    metrics.replaceChildren();
    let rows = snapshot.rows.filter(
      (s) =>
        !filter.value ||
        s[mode.value] === filter.value ||
        (mode.value === "teacher" && s.original === filter.value),
    );
    const total = counts(rows);
    for (const [key, label] of [
      ["all", "Total"],
      ["live", "In progress"],
      ["covered", "Covered"],
      ["school-cancelled", "School cancelled"],
      ["bc-cancelled", "BC cancelled"],
      ["cancelled", "Unspecified cancellation"],
    ]) {
      if (key === "cancelled" && !total[key]) continue;
      const b = button(
        "",
        () => {
          status = key;
          view.value = "schedule";
          render();
        },
        "metric-filter",
      );
      b.setAttribute("aria-pressed", String(status === key));
      b.append(el("strong", String(total[key])), el("span", label));
      metrics.append(b);
    }
    results.replaceChildren();
    if (view.value === "absence") {
      const ids = [...new Set(snapshot.leave.map((l) => String(l.teacher_id)))];
      const people = ids
        .map(
          (id) =>
            snapshot.users.find((u) => String(u.user_id) === id) || {
              user_id: id,
            },
        )
        .filter(
          (person) =>
            !filter.value ||
            (mode.value === "teacher"
              ? displayName(person) === filter.value
              : rows.some(
                  (s) =>
                    String(s.original_teacher_id) === String(person.user_id),
                )),
        );
      results.append(
        el(
          "p",
          `${people.length} teachers unavailable · ${people.filter((u) => teacherType(u) === "FT").length} FT · ${people.filter((u) => teacherType(u) === "PT").length} PT`,
          "result-count",
        ),
      );
      for (const person of people.sort((a, b) =>
        displayName(a).localeCompare(displayName(b)),
      )) {
        const card = el("details", "", "absence-card");
        const records = snapshot.leave.filter(
          (l) => String(l.teacher_id) === String(person.user_id),
        );
        const affected = rows.filter(
          (s) =>
            String(s.original_teacher_id) === String(person.user_id) &&
            records.some((l) => leaveOverlaps(s, l)),
        );
        const summary = el("summary", displayName(person));
        summary.append(
          " ",
          el("span", teacherType(person), "type-tag"),
          ` · ${affected.length} affected classes`,
        );
        card.append(summary);
        for (const l of records)
          card.append(
            el(
              "p",
              `${l.start_date} to ${l.end_date} · ${l.start_time && l.end_time ? time(l.start_time) + "–" + time(l.end_time) : "All day"}`,
            ),
          );
        if (!affected.length)
          card.append(el("p", "No overlapping classes in this selection."));
        for (const s of affected) {
          const item = sessionCard(s);
          if (category(s) === "normal")
            item.append(
              el("p", "No cover or cancellation recorded", "attention-note"),
            );
          card.append(item);
        }
        results.append(card);
      }
    } else if (view.value === "groups") {
      for (const group of [...new Set(rows.map((s) => s.group))].sort()) {
        const items = rows.filter((s) => s.group === group),
          b = button(
            "",
            () => {
              mode.value = "group";
              choices();
              filter.value = group;
              view.value = "schedule";
              status = "all";
              render();
            },
            "group-card",
          );
        b.dataset.tone = groupTone(group);
        b.append(
          el("strong", group),
          el(
            "span",
            `${items.length} classes · ${new Set(items.map((s) => s.school_id)).size} schools`,
          ),
        );
        results.append(b);
      }
    } else {
      if (view.value === "cancellations") rows = rows.filter(cancelled);
      else if (status !== "all")
        rows = rows.filter((s) =>
          status === "live" ? inProgress(s) : category(s) === status,
        );
      results.append(el("p", `${rows.length} classes shown`, "result-count"));
      if (view.value === "cancellations") {
        for (const school of [...new Set(rows.map((s) => s.school))].sort()) {
          const group = el("section", "", "cancellation-group");
          group.append(el("h2", school));
          for (const s of rows.filter((r) => r.school === school))
            group.append(sessionCard(s));
          results.append(group);
        }
      } else for (const s of rows) results.append(sessionCard(s));
      if (!rows.length)
        results.append(
          snapshot.rows.length
            ? emptyState("No classes match these filters.", "boy-confused")
            : emptyState(
                "No recorded classes for this date. This does not confirm a holiday.",
                "robot-r-neutral",
              ),
        );
    }
    // Animate only when the person changed what they are looking at, not on
    // the minute refresh.
    const key = [
      snapshot.date,
      view.value,
      mode.value,
      filter.value,
      status,
    ].join("|");
    if (key !== lastKey) {
      rise(results.children);
      if (lastKey?.split("|")[0] !== snapshot.date) rise(metrics.children);
      lastKey = key;
    }
  }
  async function load() {
    if (!date.value) return;
    const version = ++pending,
      selected = date.value;
    note.textContent = "Loading the day…";
    if (snapshot?.date !== selected) {
      snapshot = null;
      results.replaceChildren();
      metrics.replaceChildren();
    }
    try {
      const [sessions, users, schools, leave, assignments] = await Promise.all([
        query(
          "fact_daily_session",
          [{ column: "date", op: "eq", value: selected }],
          false,
          [{ column: "start_time" }, { column: "session_id" }],
        ),
        query("dim_user"),
        query("dim_school"),
        query("fact_teacher_unavailability", [
          { column: "start_date", op: "lte", value: selected },
          { column: "end_date", op: "gte", value: selected },
        ]),
        query("ref_assignment"),
      ]);
      if (version !== pending) return;
      snapshot = {
        date: selected,
        users,
        leave,
        rows: decorateSessions(
          confirmedSessions(sessions),
          users,
          schools,
          assignments,
        ),
      };
      choices();
      render();
      note.textContent = `${selected} · Asia/Bangkok · Retrieved ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date())}. In progress is based on scheduled time, not attendance.`;
    } catch {
      if (version !== pending) return;
      if (snapshot)
        note.textContent =
          "Refresh failed. Showing the previous snapshot; it may be out of date.";
      else {
        note.textContent = "";
        results.replaceChildren(
          emptyState(
            "The day could not be loaded. Please retry; missing data is not zero activity.",
            "robot-r-confused",
          ),
        );
      }
    }
  }
  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    load();
  });
  date.addEventListener("change", () => {
    status = "all";
    load();
  });
  document.getElementById("dashboard-today").addEventListener("click", () => {
    date.value = bangkokDay();
    status = "all";
    load();
  });
  for (const select of [view, filter])
    select.addEventListener("change", render);
  mode.addEventListener("change", () => {
    filter.value = "";
    if (snapshot) choices();
    render();
  });
  document
    .getElementById("dashboard-timeline")
    .addEventListener("click", () => {
      document.getElementById("daily-form").elements.date.value = date.value;
      location.hash = "operations";
      document.getElementById("daily-form").requestSubmit();
    });
  const enter = () => {
    if (location.hash === "#dashboard" && !initialized) {
      initialized = true;
      load();
    }
  };
  addEventListener("hashchange", enter);
  enter();
  setInterval(() => {
    if (!root.hidden && !document.hidden) {
      if (document.getElementById("dashboard-auto").checked) load();
      else render();
    }
  }, 60000);
}
