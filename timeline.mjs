import { el, button, download } from "./dom.mjs?v=b30c130f594d";
import {
  bangkokDay,
  time,
  cancelled,
  category,
  decorateSessions,
  confirmedSessions,
  displayName,
} from "./schedule-model.mjs?v=b30c130f594d";
import { coverConflict } from "./operations.mjs?v=b30c130f594d";
import { sessionCard } from "./dashboard.mjs?v=b30c130f594d";

export function initializeTimeline({ query, api, message, table }) {
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
      "Select a class to explore cover options. Teal: scheduled · Lime: cover · Red: cancelled · Dashed: proposed change.",
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
  function renderTimeline() {
    const root = $("daily-timeline");
    root.replaceChildren();
    if (!snapshot) return;
    if (!snapshot.rows.length) {
      root.append(el("p", "No recorded classes for this date."));
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
    const width = 1100 * Number(zoom.value),
      min = (t) =>
        Number(time(t).slice(0, 2)) * 60 + Number(time(t).slice(3, 5));
    const valid = rows.filter(
      (s) =>
        /^\d\d:\d\d/.test(s.start_time || "") &&
        /^\d\d:\d\d/.test(s.end_time || ""),
    );
    const start = Math.min(420, ...valid.map((s) => min(s.start_time))),
      end = Math.max(1080, ...valid.map((s) => min(s.end_time))),
      x = (v) => 190 + ((v - start) / (end - start)) * (width - 210);
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
    let height = 40;
    const rowY = new Map();
    for (const id of ids) {
      const lanes = [];
      rowY.set(id, height);
      for (const item of blocks
        .filter((b) => b.teacherId === id)
        .sort((a, b) => a.s.start_time.localeCompare(b.s.start_time))) {
        let lane = lanes.findIndex((end) => end <= min(item.s.start_time));
        if (lane < 0) lane = lanes.length;
        lanes[lane] = min(item.s.end_time);
        item.y = height + lane * 46;
      }
      height += Math.max(1, lanes.length) * 46 + 18;
    }
    height += 12;
    const svg = node("svg", {
      xmlns: ns,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: "group",
      "aria-label": "Interactive teaching timeline",
      class: "timeline-svg",
    });
    svg.append(node("rect", { width, height, fill: "#ffffff" }));
    for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
      svg.append(
        node("line", {
          x1: x(m),
          x2: x(m),
          y1: 32,
          y2: height,
          stroke: "#dfe7e7",
        }),
        node(
          "text",
          { x: x(m) + 2, y: 22, fill: "#4b5d61", "font-size": 12 },
          `${String(Math.floor(m / 60)).padStart(2, "0")}:00`,
        ),
      );
    }
    ids.forEach((id) => {
      const text = node(
        "text",
        { x: 8, y: rowY.get(id) + 26, fill: "#16282c", "font-size": 12 },
        name(id).slice(0, 25),
      );
      text.append(node("title", {}, name(id)));
      svg.append(text);
    });
    function block({ s, teacherId, p, ghost, y }) {
      const color = ghost
        ? "#edf0f0"
        : p?.cancelled || cancelled(s)
          ? "#ffe5e8"
          : p?.teacherId || category(s) === "covered"
            ? "#d9e994"
            : "#c1eaf0";
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
            : cancelled(s) || p?.cancelled
              ? "#a32932"
              : "#8db6bd",
        "stroke-width": selected === s.session_id ? 3 : 1,
        "stroke-dasharray": p || ghost ? "5 3" : "none",
      });
      g.append(
        rect,
        node(
          "title",
          {},
          `${label(s)} · ${name(teacherId)} · ${p ? "Proposed" : s.status}`,
        ),
        node(
          "text",
          {
            x: x(min(s.start_time)) + 5,
            y: y + 24,
            fill: "#16282c",
            "font-size": 11,
          },
          String(s.class_name).slice(
            0,
            Math.max(
              0,
              Math.floor((x(min(s.end_time)) - x(min(s.start_time)) - 10) / 6),
            ),
          ),
        ),
      );
      if (!ghost) {
        const pick = () => {
          selected = s.session_id;
          $("cover-session").value = selected;
          showSelected();
          renderTimeline();
          loadOptions();
        };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (e) => {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            pick();
          }
        });
      }
      svg.append(g);
    }
    for (const item of blocks) block(item);
    if (snapshot.date === bangkokDay()) {
      const clock = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
        m = min(clock);
      if (m >= start && m <= end) {
        svg.append(
          node("line", {
            x1: x(m),
            x2: x(m),
            y1: 30,
            y2: height,
            stroke: "#a32932",
            "stroke-width": 2,
          }),
          node(
            "text",
            { x: x(m) + 3, y: 12, fill: "#a32932", "font-size": 11 },
            "Now",
          ),
        );
      }
    }
    root.append(svg);
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
          ["status", "Status"],
        ],
        requests.map((r) => ({
          ...r,
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
          `${snapshot.requests.filter((r) => r.status === "Pending").length} pending requests`,
          "Recorded schedule, not attendance or payment confirmation.",
        ].join("\n"),
      );
      message("Daily update copied.");
    } catch (e) {
      message(e.message, true);
    }
  });
  async function saveImage() {
    const original = $("daily-timeline").querySelector("svg");
    if (!original) {
      message("Load a day first.", true);
      return;
    }
    let url;
    try {
      const svg = original.cloneNode(true),
        ns = svg.namespaceURI,
        w = Number(svg.getAttribute("width")),
        h = Number(svg.getAttribute("height")) + 32;
      const group = document.createElementNS(ns, "g");
      group.setAttribute("transform", "translate(0 32)");
      group.append(...svg.childNodes);
      svg.append(group);
      const background = document.createElementNS(ns, "rect");
      background.setAttribute("width", w);
      background.setAttribute("height", 32);
      background.setAttribute("fill", "#ffffff");
      const title = document.createElementNS(ns, "text");
      title.setAttribute("x", 8);
      title.setAttribute("y", 22);
      title.setAttribute("font-size", 16);
      title.textContent = `${snapshot.date} · Asia/Bangkok${proposals.size ? " · PROPOSED CHANGES (not saved)" : " · Recorded schedule"}`;
      svg.prepend(background, title);
      svg.setAttribute("height", h);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
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
    if (location.hash === "#operations" && !snapshot) load();
  };
  addEventListener("hashchange", enter);
  enter();
  setInterval(() => {
    if (!document.hidden && !$("operations").hidden) {
      if (auto.checked && !proposals.size) load({ automatic: true });
      else if (snapshot) renderTimeline();
    }
  }, 60000);
}
