import { el, button, download, modal } from "./dom.mjs?v=7502a32cfa1d";
import {
  bangkokDay,
  time,
  cancelled,
  category,
  decorateSessions,
  confirmedSessions,
  displayName,
  groupTone,
} from "./schedule-model.mjs?v=7502a32cfa1d";
import { coverConflict } from "./operations.mjs?v=7502a32cfa1d";
import { sessionCard } from "./dashboard.mjs?v=7502a32cfa1d";

export function initializeTimeline({
  query,
  api,
  message,
  table,
  canView = () => true,
}) {
  const $ = (id) => document.getElementById(id),
    form = $("daily-form"),
    date = form.elements.date,
    proposals = new Map();
  let snapshot,
    selected = null,
    version = 0,
    suggestionVersion = 0,
    options = [];
  const output = $("daily-output"),
    panel = el("div", "", "timeline-panel"),
    controls = el("div", "", "timeline-controls");
  const zoom = el("input");
  zoom.type = "range";
  zoom.min = "1";
  zoom.max = "3";
  zoom.step = "0.25";
  zoom.value = "1";
  const zoomLabel = el("label", "Zoom");
  zoomLabel.append(zoom);
  const auto = el("input");
  auto.type = "checkbox";
  auto.id = "timeline-auto";
  auto.checked = true;
  const autoLabel = el("label", "", "check-label");
  autoLabel.append(auto, document.createTextNode("Auto refresh · 1 min"));
  const search = el("input");
  search.type = "search";
  search.placeholder = "Find teacher, school or class";
  const searchLabel = el("label", "Search timeline");
  searchLabel.append(search);
  controls.append(
    zoomLabel,
    searchLabel,
    autoLabel,
    button("Save timeline image", () => saveImage()),
    button("Show recorded changes", () => {
      $("daily-changes").hidden = !$("daily-changes").hidden;
    }),
  );
  $("daily-timeline").before(
    controls,
    el(
      "p",
      "Click a class to see cover options. Colour: school group (as in the calendar) · Lime edge: cover · Red: cancelled · Dashed outline: proposed change · Dashed box: free period.",
      "input-hint",
    ),
  );
  $("daily-timeline").after(panel);
  const changes = el("div", "", "table-wrap");
  changes.id = "daily-changes";
  changes.hidden = true;
  panel.after(changes);
  const suggestions = el("div", "", "cover-suggestions");
  suggestions.id = "cover-suggestions";
  $("cover-form").before(suggestions);
  const review = el("div", "", "simulation-plan");
  review.id = "simulation-plan";
  $("cover-output").before(review);
  const byId = (id) => snapshot?.users.find((u) => u.user_id === id);
  const name = (id) => displayName(byId(id) || { user_id: id });
  const label = (s) =>
    `${time(s.start_time)}–${time(s.end_time)} ${s.school} ${s.class_name}`;
  const planConflicts = () =>
    [...proposals].flatMap(([id, p]) => {
      if (p.cancelled) return [];
      const s = snapshot.rows.find((row) => row.session_id === id);
      const error = coverConflict(
        s,
        p.teacherId,
        snapshot.rows,
        snapshot.leave,
        proposals,
      );
      return error ? [`${label(s)}: ${error}`] : [];
    });
  const planRows = () =>
    [...proposals].map(([id, p]) => {
      const s = snapshot.rows.find((s) => s.session_id === id);
      return {
        session: label(s),
        before: name(s.actual_teacher_id),
        after: p.cancelled ? "Proposed cancellation" : name(p.teacherId),
      };
    });
  function renderPlan() {
    review.replaceChildren();
    const conflicts = planConflicts();
    $("copy-cover").disabled = conflicts.length > 0;
    if (proposals.size) {
      review.append(
        el("h3", `${proposals.size} proposed changes`),
        el(
          "p",
          "Simulation only. Auto refresh is paused while changes are being explored.",
        ),
      );
      for (const [id, p] of proposals) {
        const s = snapshot.rows.find((s) => s.session_id === id),
          row = el("div", "", "proposal-row");
        row.append(
          el(
            "span",
            `${label(s)} · ${p.cancelled ? "Cancel" : name(s.actual_teacher_id) + " → " + name(p.teacherId)}`,
          ),
          button("Undo", () => {
            proposals.delete(id);
            render();
            loadOptions();
          }),
        );
        review.append(row);
      }
      for (const conflict of conflicts)
        review.append(
          el(
            "p",
            conflict +
              " Undo or revise the conflicting proposal before copying.",
            "attention-note",
          ),
        );
    }
    table(
      "cover-output",
      [
        ["session", "Class"],
        ["before", "Recorded teacher"],
        ["after", "Proposed change"],
      ],
      planRows(),
    );
  }
  // Layout: names column (frozen left), time scale (frozen top), and the
  // classes. Each is its own SVG so the edges stay put while scrolling.
  const NAMES = 190,
    HEAD = 44,
    LANE = 46;
  let parts = null;
  function renderTimeline() {
    const root = $("daily-timeline");
    const kept = { left: root.scrollLeft, top: root.scrollTop };
    const first = !root.querySelector(".tl-grid");
    root.replaceChildren();
    parts = null;
    if (!snapshot) return;
    if (!snapshot.rows.length) {
      root.append(el("p", "No recorded classes for this date.", "tl-empty"));
      return;
    }
    const term = search.value.trim().toLowerCase();
    const rows = snapshot.rows.filter((s) =>
      [
        s.teacher,
        s.original,
        s.school,
        s.class_name,
        name(proposals.get(s.session_id)?.teacherId),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
    const ids = [
      ...new Set(
        rows.flatMap((s) =>
          [
            s.actual_teacher_id || "unassigned",
            proposals.get(s.session_id)?.teacherId,
          ].filter(Boolean),
        ),
      ),
    ].sort((a, b) => name(a).localeCompare(name(b)));
    const ns = "http://www.w3.org/2000/svg",
      node = (tag, attrs, text) => {
        const n = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text) n.textContent = text;
        return n;
      };
    const width = 910 * Number(zoom.value),
      min = (t) =>
        Number(time(t).slice(0, 2)) * 60 + Number(time(t).slice(3, 5));
    const valid = rows.filter(
      (s) =>
        /^\d\d:\d\d/.test(s.start_time || "") &&
        /^\d\d:\d\d/.test(s.end_time || ""),
    );
    const start = Math.min(420, ...valid.map((s) => min(s.start_time))),
      end = Math.max(1080, ...valid.map((s) => min(s.end_time))),
      x = (v) => 12 + ((v - start) / (end - start)) * (width - 24);
    const blocks = valid.flatMap((s) => {
      const p = proposals.get(s.session_id);
      return [
        ...(p?.teacherId && p.teacherId !== s.actual_teacher_id
          ? [
              {
                s,
                teacherId: s.actual_teacher_id || "unassigned",
                p: null,
                ghost: true,
              },
            ]
          : []),
        {
          s,
          teacherId: p?.teacherId || s.actual_teacher_id || "unassigned",
          p,
          ghost: false,
        },
      ];
    });
    // Rows: one band per teacher, as many lanes as overlapping classes.
    let height = 0;
    const bands = [];
    for (const id of ids) {
      const lanes = [];
      const top = height;
      for (const item of blocks
        .filter((b) => b.teacherId === id)
        .sort((a, b) => a.s.start_time.localeCompare(b.s.start_time))) {
        let lane = lanes.findIndex((end) => end <= min(item.s.start_time));
        if (lane < 0) lane = lanes.length;
        lanes[lane] = min(item.s.end_time);
        item.y = top + 9 + lane * LANE;
      }
      height += Math.max(1, lanes.length) * LANE + 18;
      bands.push({ id, top, bottom: height });
    }
    height += 6;
    // The usual periods of the day: the most used start-end times that do
    // not overlap each other.
    const slotCount = new Map();
    for (const s of snapshot.rows)
      if (
        /^\d\d:\d\d/.test(s.start_time || "") &&
        /^\d\d:\d\d/.test(s.end_time || "")
      ) {
        const key = time(s.start_time) + "-" + time(s.end_time);
        slotCount.set(key, (slotCount.get(key) || 0) + 1);
      }
    const periods = [];
    for (const [key, n] of [...slotCount].sort((a, b) => b[1] - a[1])) {
      if (n < 2) break;
      const [a, b] = key.split("-").map(min);
      if (b > a && periods.every((p) => b <= p.a || a >= p.b))
        periods.push({ a, b });
    }
    // School group colours, the same as the calendar's.
    const css = getComputedStyle(document.documentElement);
    const toneOf = (s) => {
      const key = groupTone(s.group);
      return {
        bg: css.getPropertyValue(`--tone-${key}-bg`).trim() || "#c1eaf0",
        line: css.getPropertyValue(`--tone-${key}-line`).trim() || "#8db6bd",
      };
    };
    const svg = (cls, w, h, label) =>
      node("svg", {
        xmlns: ns,
        width: w,
        height: h,
        viewBox: `0 0 ${w} ${h}`,
        class: cls,
        ...(label
          ? { role: "group", "aria-label": label }
          : { "aria-hidden": "true" }),
      });
    const head = svg("tl-head", width, HEAD);
    const names = svg("tl-names", NAMES, height);
    const body = svg(
      "timeline-svg tl-body",
      width,
      height,
      "Interactive teaching timeline",
    );
    head.append(node("rect", { width, height: HEAD, fill: "#ffffff" }));
    names.append(node("rect", { width: NAMES, height, fill: "#ffffff" }));
    body.append(node("rect", { width, height, fill: "#ffffff" }));
    // Cancelled classes: red diagonal stripes (Thesaban is pink as well).
    const stripes = node("pattern", {
      id: "tl-cancelled",
      patternUnits: "userSpaceOnUse",
      width: 8,
      height: 8,
      patternTransform: "rotate(45)",
    });
    stripes.append(
      node("rect", { width: 8, height: 8, fill: "#fff5f6" }),
      node("line", {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 8,
        stroke: "#f4b6be",
        "stroke-width": 3,
      }),
    );
    const patterns = node("defs", {});
    patterns.append(stripes);
    body.append(patterns);
    // Row bands: a light stripe on every other teacher, a line between rows.
    bands.forEach(({ id, top, bottom }, i) => {
      for (const [target, w] of [
        [names, NAMES],
        [body, width],
      ]) {
        if (i % 2)
          target.append(
            node("rect", {
              y: top,
              width: w,
              height: bottom - top,
              fill: "#f6f9f9",
            }),
          );
        target.append(
          node("line", {
            x1: 0,
            x2: w,
            y1: bottom,
            y2: bottom,
            stroke: "#e8eeee",
          }),
        );
      }
      const text = node(
        "text",
        { x: 12, y: top + 35, fill: "#16282c", "font-size": 12 },
        name(id).slice(0, 25),
      );
      text.append(node("title", {}, name(id)));
      names.append(text);
    });
    // Grid: every hour (labelled), half hour, and quarter hour when zoomed in.
    const step = Number(zoom.value) >= 2 ? 15 : 30;
    for (let m = Math.ceil(start / step) * step; m <= end; m += step) {
      const hour = m % 60 === 0,
        half = m % 30 === 0;
      body.append(
        node("line", {
          x1: x(m),
          x2: x(m),
          y1: 0,
          y2: height,
          stroke: hour ? "#d3dfe0" : half ? "#e6eded" : "#f0f4f4",
          ...(hour ? {} : { "stroke-dasharray": "3 4" }),
        }),
      );
      head.append(
        node("line", {
          x1: x(m),
          x2: x(m),
          y1: hour ? 26 : half ? 33 : 37,
          y2: HEAD,
          stroke: hour ? "#9fb3b6" : "#c9d6d8",
        }),
      );
      if (hour)
        head.append(
          node(
            "text",
            { x: x(m) + 3, y: 20, fill: "#4b5d61", "font-size": 12 },
            `${String(Math.floor(m / 60)).padStart(2, "0")}:00`,
          ),
        );
    }
    // Free periods: a dashed box where the teacher has no class.
    for (const { id, top } of bands) {
      if (id === "unassigned") continue;
      const own = blocks.filter((b) => b.teacherId === id && !b.ghost);
      for (const { a, b } of periods)
        if (!own.some((o) => min(o.s.start_time) < b && min(o.s.end_time) > a))
          body.append(
            node("rect", {
              x: x(a) + 1,
              y: top + 9,
              width: Math.max(4, x(b) - x(a) - 2),
              height: 40,
              rx: 5,
              fill: "none",
              stroke: "#b9c9cc",
              "stroke-dasharray": "4 4",
              class: "tl-free",
            }),
          );
    }
    function block({ s, teacherId, p, ghost, y }) {
      const tone = toneOf(s);
      const isCancelled = !ghost && (p?.cancelled || cancelled(s));
      const isCover =
        !ghost && !isCancelled && (p?.teacherId || category(s) === "covered");
      const color = ghost
        ? "#edf0f0"
        : isCancelled
          ? "url(#tl-cancelled)"
          : tone.bg;
      const g = node("g", {
        tabindex: ghost ? -1 : 0,
        role: "button",
        "aria-label": `${label(s)} · ${name(teacherId)}${p ? " · Proposed change" : ""}`,
      });
      const rect = node("rect", {
        x: x(min(s.start_time)),
        y,
        width: Math.max(5, x(min(s.end_time)) - x(min(s.start_time))),
        height: 40,
        rx: 5,
        fill: color,
        stroke:
          selected === s.session_id
            ? "#006e82"
            : isCancelled
              ? "#a32932"
              : ghost
                ? "#b9c9cc"
                : tone.line,
        "stroke-width": selected === s.session_id ? 3 : isCancelled ? 1.5 : 1,
        "stroke-dasharray": p || ghost ? "5 3" : "none",
      });
      g.append(
        rect,
        ...(isCover
          ? [
              node("rect", {
                x: x(min(s.start_time)) + 1,
                y: y + 1,
                width: 6,
                height: 38,
                rx: 3,
                fill: "#9bc11c",
              }),
            ]
          : []),
        node(
          "title",
          {},
          `${label(s)} · ${name(teacherId)} · ${p ? "Proposed" : s.status}`,
        ),
        node(
          "text",
          {
            x: x(min(s.start_time)) + (isCover ? 10 : 5),
            y: y + 24,
            fill: isCancelled ? "#a32932" : "#16282c",
            "font-size": 11,
          },
          (isCancelled ? "✕ " : "") +
            String(s.class_name).slice(
              0,
              Math.max(
                0,
                Math.floor(
                  (x(min(s.end_time)) - x(min(s.start_time)) - 10) / 6,
                ),
              ),
            ),
        ),
      );
      if (!ghost) {
        // Click a class: its cover options open right here, in a side panel.
        const pick = () => {
          selected = s.session_id;
          $("cover-session").value = selected;
          showSelected();
          renderTimeline();
          loadOptions();
          openCoverSheet();
        };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (e) => {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            pick();
          }
        });
      }
      body.append(g);
    }
    for (const item of blocks) block(item);
    // Now: a glowing line across the classes and a tag in the time scale.
    let now = null;
    if (snapshot.date === bangkokDay()) {
      const clock = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
        m = min(clock);
      if (m >= start && m <= end) {
        now = x(m);
        const defs = node("defs", {});
        const filter = node("filter", {
          id: "tl-now-glow",
          x: "-200%",
          y: "-5%",
          width: "500%",
          height: "110%",
        });
        filter.append(node("feGaussianBlur", { stdDeviation: 3 }));
        defs.append(filter);
        body.append(
          defs,
          node("line", {
            x1: now,
            x2: now,
            y1: 0,
            y2: height,
            stroke: "#ff4d6d",
            "stroke-width": 6,
            opacity: 0.55,
            filter: "url(#tl-now-glow)",
            class: "tl-now-glow",
          }),
          node("line", {
            x1: now,
            x2: now,
            y1: 0,
            y2: height,
            stroke: "#e11d48",
            "stroke-width": 2,
          }),
        );
        const tag = `Now ${clock}`;
        head.append(
          node("rect", {
            x: now - 34,
            y: 24,
            width: 68,
            height: 18,
            rx: 9,
            fill: "#e11d48",
          }),
          node(
            "text",
            {
              x: now,
              y: 37,
              fill: "#ffffff",
              "font-size": 11,
              "font-weight": 700,
              "text-anchor": "middle",
            },
            tag,
          ),
        );
      }
    }
    const grid = el("div", "", "tl-grid");
    grid.style.gridTemplateColumns = `${NAMES}px ${width}px`;
    grid.append(el("div", "Teacher", "tl-corner"), head, names, body);
    root.append(grid);
    parts = { head, names, body, width, height };
    if (first && now != null)
      // Opening today: start at the current time.
      root.scrollLeft = Math.max(0, NAMES + now - root.clientWidth / 2);
    else {
      root.scrollLeft = kept.left;
      root.scrollTop = kept.top;
    }
  }
  // Cover options for the clicked class, in a side panel (no scrolling).
  let sheet = null;
  function openCoverSheet() {
    const s = snapshot?.rows.find((r) => r.session_id === selected);
    if (!s) return;
    if (sheet?.open) {
      sheet.querySelector("h2").textContent = `Cover: ${label(s)}`;
      return;
    }
    const { dialog, body } = modal(`Cover: ${label(s)}`);
    dialog.classList.add("day-sheet", "cover-sheet");
    const tools = el("div", "", "request-tools");
    tools.append(
      button("Simulate cancelling this class", () => {
        $("cancel-simulated").click();
        dialog.close();
      }),
    );
    body.append(panel, suggestions, tools);
    dialog.addEventListener("close", () => {
      changes.before(panel);
      $("cover-form").before(suggestions);
      sheet = null;
    });
    dialog.showModal();
    sheet = dialog;
  }
  function showSelected() {
    panel.replaceChildren();
    const row = snapshot?.rows.find((s) => s.session_id === selected);
    if (row) panel.append(sessionCard(row));
  }
  function render() {
    renderTimeline();
    renderPlan();
    showSelected();
  }
  async function loadOptions() {
    const generation = ++suggestionVersion;
    options = [];
    suggestions.replaceChildren();
    $("cover-teacher").replaceChildren(
      new Option("Select a suggested teacher", ""),
    );
    if (!snapshot || !selected) return;
    suggestions.append(el("p", "Finding teachers without recorded overlaps…"));
    try {
      const result = await api("/cover/options", {
        method: "POST",
        data: {
          date: snapshot.date,
          session_id: selected,
          proposals: [...proposals].map(([session_id, p]) => ({
            session_id,
            teacherId: p.teacherId,
            cancelled: Boolean(p.cancelled),
          })),
        },
      });
      if (generation !== suggestionVersion) return;
      options = result.data;
      suggestions.replaceChildren(
        el("h3", "Cover options"),
        el(
          "p",
          "Matching teaching role, active Braincloud staff, no overlapping class or recorded leave. Confirm availability with the team.",
          "input-hint",
        ),
      );
      for (const candidate of options) {
        $("cover-teacher").append(
          new Option(
            `${candidate.name} · ${candidate.type} · ${candidate.workload} other classes`,
            candidate.id,
          ),
        );
        const row = el("article", "", "candidate-card");
        row.append(
          el("strong", candidate.name),
          el("span", `${candidate.type} · ${candidate.workload} other classes`),
          el("small", candidate.note),
          button("Try this teacher", () => assign(candidate.id)),
        );
        suggestions.append(row);
      }
      if (!options.length)
        suggestions.append(
          el("p", "No teachers match the recorded rules for this class."),
        );
    } catch (e) {
      if (generation === suggestionVersion)
        suggestions.replaceChildren(el("p", e.message, "attention-note"));
    }
  }
  function assign(id) {
    const target = snapshot.rows.find((s) => s.session_id === selected);
    if (!target || !options.some((o) => o.id === id)) {
      message("Choose a suggested teacher first.", true);
      return;
    }
    const conflict = coverConflict(
      target,
      id,
      snapshot.rows,
      snapshot.leave,
      proposals,
    );
    if (conflict) {
      message(conflict, true);
      return;
    }
    proposals.set(selected, { teacherId: id });
    render();
    loadOptions();
    sheet?.close();
    message("Cover proposed locally. The recorded schedule is unchanged.");
  }
  async function load({ automatic = false } = {}) {
    if (!date.value) return;
    if (proposals.size) {
      if (automatic) return;
      if (
        !confirm("Loading fresh data clears your local proposals. Continue?")
      ) {
        date.value = snapshot.date;
        return;
      }
    }
    const generation = ++version,
      requested = date.value;
    $("daily-note").textContent = "Loading recorded data…";
    if (snapshot?.date !== requested) {
      output.hidden = true;
      snapshot = null;
    }
    try {
      const [sessions, users, schools, leave, requests, assignments] =
        await Promise.all([
          query(
            "fact_daily_session",
            [{ column: "date", op: "eq", value: requested }],
            false,
            [{ column: "start_time" }, { column: "session_id" }],
          ),
          query("dim_user"),
          query("dim_school"),
          query("fact_teacher_unavailability", [
            { column: "start_date", op: "lte", value: requested },
            { column: "end_date", op: "gte", value: requested },
          ]),
          query("requests_log", [
            { column: "start_date", op: "lte", value: requested },
            { column: "end_date", op: "gte", value: requested },
          ]),
          query("ref_assignment"),
        ]);
      if (generation !== version) return;
      snapshot = {
        date: requested,
        users,
        schools,
        leave,
        requests,
        rows: decorateSessions(
          confirmedSessions(sessions),
          users,
          schools,
          assignments,
        ),
      };
      proposals.clear();
      selected = null;
      ++suggestionVersion;
      suggestions.replaceChildren();
      panel.replaceChildren();
      $("cover-session").replaceChildren(new Option("Select a class", ""));
      $("cover-teacher").replaceChildren(
        new Option("Select a suggested teacher", ""),
      );
      for (const s of snapshot.rows)
        $("cover-session").append(new Option(label(s), s.session_id));
      table(
        "daily-sessions",
        [
          ["time", "Time"],
          ["school", "School"],
          ["class_name", "Class"],
          ["original", "Original teacher"],
          ["teacher", "Actual teacher"],
          ["status", "Status"],
        ],
        snapshot.rows.map((s) => ({
          ...s,
          time: `${time(s.start_time)}–${time(s.end_time)}`,
        })),
      );
      table(
        "daily-leave",
        [
          ["teacher", "Teacher"],
          ["start_time", "From"],
          ["end_time", "To"],
        ],
        leave.map((l) => ({ ...l, teacher: name(l.teacher_id) })),
      );
      table(
        "daily-requests",
        [
          ["id", "Request"],
          ["who", "School / teacher"],
          ["withdrawn", "Withdrawn"],
        ],
        requests.map((r) => ({
          ...r,
          withdrawn: /^(cancelled|rejected)$/i.test(String(r.status || ""))
            ? "Withdrawn"
            : "",
          who:
            r.request_category === "Teacher"
              ? name(r.teacher_id)
              : r.school_code,
        })),
      );
      table(
        "daily-changes",
        [
          ["time", "Time"],
          ["school", "School"],
          ["class_name", "Class"],
          ["original", "Original teacher"],
          ["teacher", "Actual teacher"],
          ["status", "Status"],
        ],
        snapshot.rows
          .filter((s) => category(s) !== "normal")
          .map((s) => ({ ...s, time: time(s.start_time) })),
      );
      output.hidden = false;
      render();
      $("daily-note").textContent =
        `${requested} · ${sessions.length} recorded classes · Asia/Bangkok · Retrieved ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok" })}.`;
    } catch (e) {
      if (generation === version)
        $("daily-note").textContent = snapshot
          ? "Refresh failed. Showing the previous snapshot; it may be out of date."
          : "The day could not be loaded. Please retry.";
      message(e.message, true);
    }
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    load();
  });
  date.addEventListener("change", () => load());
  $("cover-session").addEventListener("change", () => {
    selected = $("cover-session").value;
    showSelected();
    renderTimeline();
    loadOptions();
  });
  $("cover-form").addEventListener("submit", (e) => {
    e.preventDefault();
    assign($("cover-teacher").value);
  });
  $("cancel-simulated").addEventListener("click", () => {
    const s = snapshot?.rows.find((s) => s.session_id === selected);
    if (!s || cancelled(s)) {
      message("Select a class that is not already cancelled.", true);
      return;
    }
    proposals.set(selected, { cancelled: true });
    render();
    loadOptions();
  });
  $("clear-cover").addEventListener("click", () => {
    proposals.clear();
    render();
    loadOptions();
  });
  $("copy-cover").addEventListener("click", async () => {
    try {
      if (!snapshot || !proposals.size)
        throw Error("Add a proposed change first.");
      await navigator.clipboard.writeText(
        [
          `PROPOSED changes · ${snapshot.date} · Asia/Bangkok`,
          ...planRows().map((r) => `${r.session}: ${r.before} → ${r.after}`),
          "Simulation only. Confirm with the team; no schedule changes have been saved.",
        ].join("\n"),
      );
      message("Proposed changes copied.");
    } catch (e) {
      message(e.message, true);
    }
  });
  $("copy-daily").addEventListener("click", async () => {
    try {
      if (!snapshot) throw Error("Load a day first.");
      await navigator.clipboard.writeText(
        [
          `Braincloud daily update · ${snapshot.date}`,
          `${snapshot.rows.length} classes · ${snapshot.rows.filter(cancelled).length} cancellations · ${snapshot.rows.filter((s) => category(s) === "covered").length} covers`,
          ...snapshot.rows
            .filter((s) => category(s) !== "normal")
            .map(
              (s) =>
                `${label(s)} · ${s.status} · ${s.teacher} · Original: ${s.original}`,
            ),
          `${snapshot.requests.filter((r) => !/^(cancelled|rejected)$/i.test(String(r.status || ""))).length} requests (leave and closures)`,
          "Recorded schedule, not attendance or payment confirmation.",
        ].join("\n"),
      );
      message("Daily update copied.");
    } catch (e) {
      message(e.message, true);
    }
  });
  async function saveImage() {
    if (!parts) {
      message("Load a day first.", true);
      return;
    }
    let url;
    try {
      const ns = "http://www.w3.org/2000/svg",
        w = NAMES + parts.width,
        h = 32 + HEAD + parts.height,
        svg = document.createElementNS(ns, "svg");
      svg.setAttribute("xmlns", ns);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const place = (part, dx, dy) => {
        const g = document.createElementNS(ns, "g");
        g.setAttribute("transform", `translate(${dx} ${dy})`);
        g.append(...part.cloneNode(true).childNodes);
        svg.append(g);
      };
      const background = document.createElementNS(ns, "rect");
      background.setAttribute("width", w);
      background.setAttribute("height", h);
      background.setAttribute("fill", "#ffffff");
      const title = document.createElementNS(ns, "text");
      title.setAttribute("x", 8);
      title.setAttribute("y", 22);
      title.setAttribute("font-size", 16);
      title.textContent = `${snapshot.date} · Asia/Bangkok${proposals.size ? " · PROPOSED CHANGES (not saved)" : " · Recorded schedule"}`;
      svg.append(background, title);
      place(parts.head, NAMES, 32);
      place(parts.names, 0, 32 + HEAD);
      place(parts.body, NAMES, 32 + HEAD);
      url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
      );
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const scale = Math.min(2, Math.sqrt(16000000 / (w * h))),
        canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw Error();
      download(
        blob,
        "image/png",
        `braincloud-timeline-${snapshot.date}${proposals.size ? "-PROPOSED" : ""}.png`,
      );
    } catch {
      message("The timeline image could not be saved. Please retry.", true);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  zoom.addEventListener("input", renderTimeline);
  const scroller = $("daily-timeline");
  const setZoom = (value, focus = scroller.clientWidth / 2) => {
    const old = Number(zoom.value),
      next = Math.max(1, Math.min(3, Math.round(value * 4) / 4));
    if (next === old) return;
    const relative = (scroller.scrollLeft + focus) / old;
    zoom.value = String(next);
    renderTimeline();
    scroller.scrollLeft = relative * next - focus;
  };
  scroller.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(
        Number(zoom.value) + (event.deltaY < 0 ? 0.25 : -0.25),
        event.clientX - scroller.getBoundingClientRect().left,
      );
    },
    { passive: false },
  );
  let pinch;
  scroller.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2)
        pinch = {
          distance: Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY,
          ),
          zoom: Number(zoom.value),
        };
    },
    { passive: true },
  );
  scroller.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 2 || !pinch || !pinch.distance) return;
      event.preventDefault();
      setZoom(
        (pinch.zoom *
          Math.hypot(
            event.touches[0].clientX - event.touches[1].clientX,
            event.touches[0].clientY - event.touches[1].clientY,
          )) /
          pinch.distance,
      );
    },
    { passive: false },
  );
  scroller.addEventListener("touchend", () => (pinch = null), {
    passive: true,
  });
  search.addEventListener("input", renderTimeline);
  const enter = () => {
    if (location.hash === "#operations" && !snapshot && canView()) load();
  };
  addEventListener("hashchange", enter);
  addEventListener("admin-signed-in", enter);
  enter();
  setInterval(() => {
    if (!document.hidden && !$("operations").hidden) {
      if (auto.checked && !proposals.size) load({ automatic: true });
      else if (snapshot) renderTimeline();
    }
  }, 60000);
}
