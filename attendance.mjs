import { el, button, download, modal } from "./dom.mjs?v=3fe0f0184825";
import { bangkokDay } from "./schedule-model.mjs?v=3fe0f0184825";
export function initializeAttendance({ api }) {
  const root = document.getElementById("attendance-report"),
    form = document.getElementById("attendance-form"),
    output = document.getElementById("attendance-output"),
    note = document.getElementById("attendance-note");
  let report = null,
    generation = 0,
    page = 0,
    dialog = null;
  const today = bangkokDay();
  form.elements.end.value = today;
  form.elements.start.value = new Date(Date.parse(today) - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  form.elements.start.dispatchEvent(new Event("input"));
  const readable = (v) => v || "Not recorded";
  const stamp = (v) =>
    v
      ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })
      : "Not collected yet";
  const filters = () => ({
    start: form.elements.start.value,
    end: form.elements.end.value,
    school: form.elements.school.value,
    teacher: form.elements.teacher.value,
  });
  function reset() {
    ++generation;
    report = null;
    output.replaceChildren();
    dialog?.close();
    dialog = null;
    note.textContent =
      "Sign in and load a date range to view connection records.";
    root
      .querySelectorAll("[data-attendance-export]")
      .forEach((b) => (b.disabled = true));
  }
  addEventListener("admin-signed-out", reset);
  function details(row) {
    const body = el("div"),
      dl = el("dl", "", "review-details");
    for (const [k, v] of [
      ["Scheduled period", `${row.scheduled_start}–${row.scheduled_end}`],
      ["Teacher first join", readable(row.teacher.first_join)],
      ["Teacher final leave", readable(row.teacher.last_leave)],
      ["Classroom first join", readable(row.classroom.first_join)],
      ["Classroom final leave", readable(row.classroom.last_leave)],
      [
        "TMS teaching time",
        row.teaching_seconds == null
          ? "Not recorded"
          : `${Math.floor(row.teaching_seconds / 60)} min ${row.teaching_seconds % 60} sec`,
      ],
      ["Retrieved", stamp(row.collected_at)],
    ])
      dl.append(el("dt", k), el("dd", v));
    body.append(
      dl,
      el(
        "p",
        "All times are Asia/Bangkok. The classroom row records an attendant account connection. It does not confirm individual student attendance.",
        "input-hint",
      ),
    );
    if (row.flags.length)
      body.append(el("p", row.flags.join(" · "), "attention-note"));
    body.append(el("h3", "Connection events"));
    const events = el("ol", "", "connection-events");
    for (const e of row.events) {
      const item = el("li", "", "connection-event");
      item.dataset.role = e.role;
      item.append(
        el("strong", e.time),
        el("span", `${e.actor} · ${e.action}`),
        el(
          "small",
          `${e.role === "attendant" ? "Classroom" : e.role}${e.in_window ? "" : " · Outside summary window"}`,
        ),
      );
      events.append(item);
    }
    body.append(
      row.events.length
        ? events
        : el("p", "No connection events were recorded in this source page."),
    );
    const source = el("a", "Open source session");
    source.href =
      "https://tms.braincloudlearning.com/home-sessions/session-form?" +
      new URLSearchParams({ id: row.session_id });
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    body.append(source);
    const view = modal(`${row.date} · ${row.school_code} · ${row.class_name}`);
    view.body.append(body);
    dialog = view.dialog;
    dialog.showModal();
  }
  function render() {
    output.replaceChildren();
    if (!report) return;
    const c = report.coverage,
      targets = report.targets.filter(
        (t) => !report.params.school || t.school_code === report.params.school,
      ),
      pendingTargets = targets.filter((t) => !t.indexed_at || t.last_error);
    const status = el("div", "", "coverage-banner");
    status.append(
      el(
        "strong",
        pendingTargets.length || c.pending || c.failed
          ? "Collection is still in progress"
          : "Available records collected",
      ),
      el(
        "p",
        `${c.collected} collected / ${c.discovered} discovered sessions for the school/date range · ${c.pending} awaiting first collection · ${c.failed} fetch errors. ${pendingTargets.length} school/year indexes need collection or retry.`,
      ),
      el(
        "p",
        `Collection begins ${c.settings?.coverage_start || "when configured"}. Last worker: ${c.latest_job?.status || "not run"} · ${stamp(c.latest_job?.finished_at)}. Latest record retrieved: ${stamp(c.newest_collection)}.`,
      ),
    );
    if (c.settings?.discovery_error)
      status.append(
        el(
          "p",
          "School discovery failed. Coverage may be incomplete.",
          "attention-note",
        ),
      );
    if (c.latest_job?.error_code)
      status.append(
        el(
          "p",
          `Latest collection needs attention: ${c.latest_job.error_code.replaceAll("_", " ").toLowerCase()}. Previously collected records remain available.`,
          "attention-note",
        ),
      );
    if (c.settings?.database_bytes >= 400 * 1024 * 1024)
      status.append(
        el(
          "p",
          "Database storage is approaching the free-plan collection guard. Export and review storage with the administrator; new collection pauses at 450 MiB.",
          "attention-note",
        ),
      );
    if (
      c.settings?.coverage_start &&
      report.params.start < c.settings.coverage_start
    )
      status.append(
        el(
          "p",
          "Part of this range is before the collection start. No historical completeness is claimed.",
          "attention-note",
        ),
      );
    output.append(status);
    const metrics = el("div", "", "metric-grid");
    for (const [n, label] of [
      [report.rows.length, "Matching sessions"],
      [
        report.rows.filter((r) => r.teacher.first_join).length,
        "Teacher join recorded",
      ],
      [
        report.rows.filter((r) => r.classroom.first_join).length,
        "Classroom join recorded",
      ],
      [report.rows.filter((r) => r.flags.length).length, "Sessions to review"],
    ]) {
      const card = el("div", "", "metric-card");
      card.append(el("strong", String(n)), el("span", label));
      metrics.append(card);
    }
    output.append(metrics);
    if (!report.rows.length) {
      output.append(
        el(
          "p",
          "No collected sessions match these filters. Review collection coverage above; this is not evidence that no classes took place.",
          "empty-state",
        ),
      );
      return;
    }
    const summary = el("details", "", "attendance-summary");
    summary.append(el("summary", "Teacher work summary"));
    summary.append(
      el(
        "p",
        "Counts use teacher accounts observed in connection events. Roster-only teachers remain unknown; these figures are not a performance score.",
        "input-hint",
      ),
    );
    const wrap = el("div", "", "table-wrap"),
      t = el("table");
    const h = t.createTHead().insertRow();
    for (const s of [
      "Teacher account",
      "Sessions",
      "Join recorded",
      "Complete sequences",
      "With reconnects",
    ]) {
      const th = el("th", s);
      th.scope = "col";
      h.append(th);
    }
    const b = t.createTBody();
    for (const s of report.summary) {
      const r = b.insertRow();
      for (const v of [
        s.teacher,
        s.sessions,
        s.join_recorded,
        s.complete_sequence,
        s.reconnect_sessions,
      ])
        r.append(el("td", String(v)));
    }
    wrap.append(t);
    summary.append(wrap);
    output.append(summary);
    const heading = el("div", "", "report-toolbar"),
      pages = Math.ceil(report.rows.length / 50);
    heading.append(
      el("h3", "Session records"),
      el("span", `Page ${page + 1} of ${pages}`),
    );
    const prev = button("Previous", () => {
        page--;
        render();
      }),
      next = button("Next", () => {
        page++;
        render();
      });
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    heading.append(prev, next);
    output.append(heading);
    const records = el("div", "", "attendance-records");
    for (const r of report.rows.slice(page * 50, page * 50 + 50)) {
      const card = el("article", "", "attendance-card"),
        top = el("div", "", "session-card-heading");
      top.append(
        el("h3", `${r.school_code} · ${r.class_name}`),
        el("span", r.date),
      );
      card.append(
        top,
        el(
          "p",
          `${r.teachers.join(" / ") || "Teacher not listed"} · Scheduled ${r.scheduled_start}–${r.scheduled_end}`,
        ),
      );
      const times = el("div", "", "connection-times");
      for (const [label, start, end] of [
        ["Teacher", r.teacher.first_join, r.teacher.last_leave],
        ["Classroom", r.classroom.first_join, r.classroom.last_leave],
      ]) {
        const v = el("div");
        v.append(
          el("small", label),
          el("strong", `${readable(start)} → ${readable(end)}`),
        );
        times.append(v);
      }
      card.append(times);
      if (r.flags.length)
        card.append(el("small", r.flags.join(" · "), "attention-note"));
      card.append(
        button("View connection events", () => details(r), "secondary"),
      );
      records.append(card);
    }
    output.append(records);
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = ++generation;
    note.textContent = "Loading private connection records…";
    e.submitter.disabled = true;
    try {
      const result = await api("/admin/attendance", {
        method: "POST",
        data: filters(),
      });
      if (current !== generation) return;
      report = result.data;
      page = 0;
      const school = form.elements.school.value,
        teacher = form.elements.teacher.value;
      form.elements.school.replaceChildren(new Option("All schools", ""));
      const seen = new Set();
      for (const t of report.targets) {
        if (!seen.has(t.school_code)) {
          seen.add(t.school_code);
          form.elements.school.append(
            new Option(`${t.school_code} · ${t.school_name}`, t.school_code),
          );
        }
      }
      form.elements.school.value = school;
      form.elements.teacher.replaceChildren(new Option("All teachers", ""));
      for (const t of report.teachers)
        form.elements.teacher.append(new Option(t, t));
      form.elements.teacher.value = teacher;
      render();
      note.textContent = `${report.params.start} to ${report.params.end} · Asia/Bangkok · ${report.rows.length} matching sessions.`;
      root
        .querySelectorAll("[data-attendance-export]")
        .forEach((b) => (b.disabled = !report.rows.length));
    } catch (error) {
      if (current === generation) {
        report = null;
        output.replaceChildren();
        note.textContent = error.message;
        root
          .querySelectorAll("[data-attendance-export]")
          .forEach((b) => (b.disabled = true));
      }
    } finally {
      e.submitter.disabled = false;
    }
  });
  form.addEventListener("change", () => {
    root
      .querySelectorAll("[data-attendance-export]")
      .forEach((b) => (b.disabled = true));
    note.textContent =
      "Filters changed. Load the report to update records and exports.";
  });
  root.querySelectorAll("[data-attendance-export]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!report) return;
      const current = generation;
      b.disabled = true;
      try {
        const r = await api("/admin/attendance/export", {
          method: "POST",
          raw: true,
          data: { ...report.params, format: b.dataset.attendanceExport },
        });
        if (current !== generation) return;
        const name =
          r.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] ||
          `connections.${b.dataset.attendanceExport}`;
        download(await r.blob(), r.headers.get("Content-Type"), name);
        note.textContent =
          "Export downloaded. It contains private connection records and the selected report scope.";
      } catch (error) {
        if (current === generation) note.textContent = error.message;
      } finally {
        if (report) b.disabled = false;
      }
    }),
  );
}
