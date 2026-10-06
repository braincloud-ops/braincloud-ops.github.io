const clockTime = (v) => String(v || "").slice(0, 5);
export const overlaps = (a, b, c, d) =>
  clockTime(a) < clockTime(d) && clockTime(c) < clockTime(b);
export function requestDays(requests, start, end) {
  const result = [];
  for (
    let n = Date.parse(start + "T00:00:00Z");
    n <= Date.parse(end + "T00:00:00Z");
    n += 86400000
  ) {
    const date = new Date(n).toISOString().slice(0, 10);
    result.push({
      date,
      requests: requests.filter(
        (r) => r.start_date <= date && r.end_date >= date,
      ),
    });
  }
  return result;
}
export function coverConflict(
  target,
  teacherId,
  sessions,
  leave,
  proposals = new Map(),
) {
  const other = sessions.find((s) => {
    if (s.session_id === target.session_id || s.date !== target.date)
      return false;
    const proposed = proposals.get(s.session_id);
    if (
      proposed?.cancelled ||
      (!proposed && String(s.status).startsWith("Cancelled"))
    )
      return false;
    return (
      (proposed?.teacherId || s.actual_teacher_id) === teacherId &&
      overlaps(target.start_time, target.end_time, s.start_time, s.end_time)
    );
  });
  if (other) return "The proposed teacher already has an overlapping session.";
  if (
    leave.some(
      (r) =>
        r.teacher_id === teacherId &&
        r.start_date <= target.date &&
        r.end_date >= target.date &&
        (!r.start_time ||
          !r.end_time ||
          overlaps(
            target.start_time,
            target.end_time,
            r.start_time,
            r.end_time,
          )),
    )
  )
    return "The proposed teacher has recorded unavailability at this time.";
  return null;
}
export function initializeDailyWorkspace({
  query,
  busy,
  message,
  table,
  teacherName,
  schoolName,
  getTeachers,
}) {
  const $ = (id) => document.getElementById(id);
  let snapshot = null;
  const proposals = new Map();
  const option = (select, value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    select.append(o);
  };
  const label = (s) =>
    `${clockTime(s.start_time)}–${clockTime(s.end_time)} ${schoolName(s.school_id)} ${s.class_name}`;
  const planRows = () =>
    [...proposals].map(([id, change]) => {
      const s = snapshot.sessions.find((s) => s.session_id === id);
      return {
        session: label(s),
        before: teacherName(s.actual_teacher_id),
        after: change.cancelled
          ? "Proposed cancellation"
          : teacherName(change.teacherId),
      };
    });
  const renderPlan = () =>
    table(
      "cover-output",
      [
        ["session", "Session"],
        ["before", "Recorded teacher"],
        ["after", "Proposed change"],
      ],
      planRows(),
    );
  function renderTimeline(rows) {
    const root = $("daily-timeline");
    root.replaceChildren();
    const ids = [
      ...new Set(rows.map((s) => s.actual_teacher_id || "unassigned")),
    ].sort((a, b) => teacherName(a).localeCompare(teacherName(b)));
    if (!rows.length) return;
    const ns = "http://www.w3.org/2000/svg";
    const node = (name, attrs, text) => {
      const e = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text) e.textContent = text;
      return e;
    };
    const width = 1100,
      height = 50 + ids.length * 54;
    const svg = node("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "img",
      class: "timeline-svg",
      "aria-label":
        "Teaching timeline. The table below contains the same recorded sessions.",
    });
    const mins = (t) =>
      Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
    const start = Math.min(7 * 60, ...rows.map((s) => mins(s.start_time))),
      end = Math.max(18 * 60, ...rows.map((s) => mins(s.end_time)));
    const x = (t) => 180 + ((t - start) / (end - start)) * 900;
    for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
      svg.append(
        node("line", {
          x1: x(m),
          x2: x(m),
          y1: 28,
          y2: height,
          class: "timeline-axis",
        }),
      );
      svg.append(
        node(
          "text",
          { x: x(m), y: 18, class: "timeline-label" },
          `${String(m / 60).padStart(2, "0")}:00`,
        ),
      );
    }
    ids.forEach((id, i) =>
      svg.append(
        node(
          "text",
          { x: 8, y: 60 + i * 54, class: "timeline-label" },
          teacherName(id),
        ),
      ),
    );
    for (const s of rows) {
      const y = 38 + ids.indexOf(s.actual_teacher_id || "unassigned") * 54;
      const block = node("rect", {
        x: x(mins(s.start_time)),
        y,
        width: Math.max(2, x(mins(s.end_time)) - x(mins(s.start_time))),
        height: 30,
        rx: 3,
        class: String(s.status).startsWith("Cancelled")
          ? "timeline-cancelled"
          : "timeline-session",
      });
      block.append(
        node(
          "title",
          {},
          `${label(s)} · ${teacherName(s.actual_teacher_id)} · ${s.status}`,
        ),
      );
      svg.append(block);
      svg.append(
        node(
          "text",
          {
            x: x(mins(s.start_time)) + 4,
            y: y + 19,
            class: "timeline-block-label",
          },
          s.class_name,
        ),
      );
    }
    root.append(svg);
  }
  $("daily-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      snapshot = null;
      proposals.clear();
      $("daily-output").hidden = true;
      $("daily-note").textContent = "Loading recorded data…";
      const date = e.target.elements.date.value;
      try {
        const [sessions, leave, requests] = await Promise.all([
          query(
            "fact_daily_session",
            [{ column: "date", op: "eq", value: date }],
            false,
            [{ column: "start_time" }, { column: "session_id" }],
          ),
          query(
            "fact_teacher_unavailability",
            [
              { column: "start_date", op: "lte", value: date },
              { column: "end_date", op: "gte", value: date },
            ],
            false,
            [{ column: "unavailability_id" }],
          ),
          query(
            "requests_log",
            [
              { column: "start_date", op: "lte", value: date },
              { column: "end_date", op: "gte", value: date },
            ],
            false,
            [{ column: "id" }],
          ),
        ]);
        snapshot = { date, sessions, leave, requests };
        table(
          "daily-sessions",
          [
            ["time", "Time"],
            ["school", "School"],
            ["class_name", "Class"],
            ["original", "Original teacher"],
            ["actual", "Actual teacher"],
            ["status", "Status"],
          ],
          sessions.map((s) => ({
            ...s,
            time: `${clockTime(s.start_time)}–${clockTime(s.end_time)}`,
            school: schoolName(s.school_id),
            original: teacherName(s.original_teacher_id),
            actual: teacherName(s.actual_teacher_id),
          })),
        );
        table(
          "daily-leave",
          [
            ["teacher", "Teacher"],
            ["start_time", "Start time"],
            ["end_time", "End time"],
          ],
          leave.map((r) => ({ ...r, teacher: teacherName(r.teacher_id) })),
        );
        table(
          "daily-requests",
          [
            ["id", "Request ID"],
            ["who", "School / teacher"],
            ["status", "Status"],
          ],
          requests.map((r) => ({
            ...r,
            who:
              r.request_category === "Teacher"
                ? teacherName(r.teacher_id)
                : r.school_code,
          })),
        );
        $("cover-session").replaceChildren();
        $("cover-teacher").replaceChildren();
        option($("cover-session"), "", "Select a session");
        option($("cover-teacher"), "", "Select a teacher");
        for (const s of sessions)
          option($("cover-session"), s.session_id, label(s));
        for (const t of getTeachers().filter(
          (t) => String(t.status).toLowerCase() === "active",
        ))
          option($("cover-teacher"), t.user_id, teacherName(t.user_id));
        renderTimeline(sessions);
        renderPlan();
        $("daily-output").hidden = false;
        $("daily-note").textContent =
          `${date} · ${sessions.length} recorded sessions · ${requests.filter((r) => r.status === "Pending").length} pending requests. ${!sessions.length ? "No recorded sessions does not confirm a holiday or zero activity." : ""}`;
        message("Daily workspace loaded.");
      } catch (error) {
        $("daily-note").textContent =
          "Daily data could not be loaded. Previous results were cleared.";
        throw error;
      }
    });
  });
  $("cover-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      if (!snapshot) throw new Error("Load a day first.");
      const target = snapshot.sessions.find(
          (s) => s.session_id === $("cover-session").value,
        ),
        teacherId = $("cover-teacher").value;
      if (!target || !teacherId)
        throw new Error("Select a session and teacher.");
      const conflict = coverConflict(
        target,
        teacherId,
        snapshot.sessions,
        snapshot.leave,
        proposals,
      );
      if (conflict) throw new Error(conflict);
      proposals.set(target.session_id, { teacherId });
      renderPlan();
      message("Proposal updated locally. The teaching schedule is unchanged.");
    });
  });
  $("cancel-simulated").addEventListener("click", () =>
    busy($("cancel-simulated"), async () => {
      const id = $("cover-session").value;
      if (!snapshot?.sessions.some((s) => s.session_id === id))
        throw new Error("Select a session.");
      proposals.set(id, { cancelled: true });
      renderPlan();
      message(
        "Cancellation proposed locally. The teaching schedule is unchanged.",
      );
    }),
  );
  $("clear-cover").addEventListener("click", () => {
    proposals.clear();
    renderPlan();
    message("Proposed changes cleared.");
  });
  $("copy-cover").addEventListener("click", () =>
    busy($("copy-cover"), async () => {
      if (!snapshot || !proposals.size)
        throw new Error("Add a proposed change first.");
      await navigator.clipboard.writeText(
        [
          `PROPOSED changes — ${snapshot.date} (Asia/Bangkok)`,
          ...planRows().map((r) => `${r.session}: ${r.before} → ${r.after}`),
          "Simulation only. Confirm with the team; nothing has been saved to the schedule.",
        ].join("\n"),
      );
      message("Proposed changes copied.");
    }),
  );
  $("copy-daily").addEventListener("click", () =>
    busy($("copy-daily"), async () => {
      if (!snapshot) throw new Error("Load a day first.");
      const { date, sessions, requests } = snapshot;
      await navigator.clipboard.writeText(
        [
          `Braincloud daily update — ${date} (Asia/Bangkok)`,
          `${sessions.length} recorded sessions; ${sessions.filter((s) => String(s.status).startsWith("Cancelled")).length} recorded cancellations`,
          ...sessions
            .filter(
              (s) =>
                String(s.status).startsWith("Cancelled") ||
                s.actual_teacher_id !== s.original_teacher_id,
            )
            .map(
              (s) =>
                `${label(s)} · ${s.status} · ${teacherName(s.actual_teacher_id)}`,
            ),
          `${requests.filter((r) => r.status === "Pending").length} pending requests`,
          "Recorded schedule only. This is not an attendance or payment confirmation.",
        ].join("\n"),
      );
      message("Daily update copied.");
    }),
  );
}
