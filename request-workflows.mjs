import { el, button, modal } from "./dom.mjs?v=2355712a139c";
import { hasLineIdentity, lineRequestHeaders } from "./line-context.mjs?v=2355712a139c";
import { time, cancelled, category } from "./schedule-model.mjs?v=2355712a139c";

export function restoreDateModes() {
  for (const id of ["school-form", "teacher-form"]) {
    const form = document.getElementById(id),
      start = form.elements.start_date,
      end = form.elements.end_date;
    const label = el("label", "", "check-label date-mode");
    const input = el("input");
    input.type = "checkbox";
    input.id = id + "-multi";
    label.append(input, document.createTextNode("Multiple days"));
    start.closest(".row").before(label);
    const times =
      id === "teacher-form"
        ? [form.elements.startTime, form.elements.endTime]
        : [];
    let singleTimes = times.map((t) => t.value),
      previous = false;
    const update = () => {
      if (!input.checked) end.value = start.value;
      else if (!end.value || end.value < start.value) end.value = start.value;
      end.min = start.value;
      end.closest("label").hidden = !input.checked;
      end.setCustomValidity(
        end.value < start.value
          ? "End date must be on or after start date."
          : "",
      );
      if (times.length) {
        if (input.checked && !previous) singleTimes = times.map((t) => t.value);
        if (input.checked) {
          times[0].value = "00:00";
          times[1].value = "23:59";
        } else if (previous)
          times.forEach((t, i) => (t.value = singleTimes[i]));
        times[0].closest(".row").hidden = input.checked;
        const note = form.querySelector(".multi-time-note");
        note.hidden = !input.checked;
      }
      previous = input.checked;
    };
    if (times.length) {
      const note = el(
        "p",
        "Multiple-day leave covers each full day (00:00–23:59, Bangkok time).",
        "multi-time-note input-hint",
      );
      times[0].closest(".row").after(note);
    }
    input.addEventListener("change", update);
    start.addEventListener("input", update);
    start.addEventListener("change", update);
    end.addEventListener("change", update);
    update();
  }
}

export function confirmSubmission(form, data, teacherName) {
  return new Promise((resolve) => {
    const { dialog, body } = modal("Review your request");
    const values = [
      ["Submitting as", data.user_name],
      [
        data.request_category === "School" ? "School" : "Teacher",
        data.request_category === "School"
          ? form.elements.school_code.selectedOptions[0]?.textContent
          : teacherName(data.teacher_id),
      ],
      [
        "Dates",
        data.start_date === data.end_date
          ? data.start_date
          : `${data.start_date} to ${data.end_date}`,
      ],
      ["Type", data.type],
      [
        "Time / sessions",
        data.request_category === "Teacher"
          ? `${data.affected_sessions.startTime}–${data.affected_sessions.endTime} (Asia/Bangkok)`
          : data.type === "Whole Day"
            ? "All sessions on the selected dates"
            : `${data.affected_sessions.length} selected sessions`,
      ],
      ["Reason", data.reason || "Not provided"],
    ];
    const details = el("dl", "", "review-details");
    for (const [key, value] of values)
      details.append(el("dt", key), el("dd", value));
    body.append(details);
    if (data.type === "Partial")
      for (const label of form.querySelectorAll(
        ".session-choice:has(input:checked)",
      ))
        body.append(el("p", label.textContent, "review-session"));
    body.append(
      el(
        "p",
        "Your request will be marked Pending. It does not change the teaching schedule automatically.",
        "input-hint",
      ),
    );
    const actions = el("div", "", "dialog-actions");
    actions.append(
      button("Back to edit", () => dialog.close()),
      button(
        "Confirm and submit",
        () => {
          resolve(true);
          dialog.close();
        },
        "",
      ),
    );
    body.append(actions);
    dialog.addEventListener("close", () => resolve(false), { once: true });
    dialog.showModal();
  });
}

export function initializeRequestWorkflows({
  query,
  api,
  getSchools,
  teacherName,
}) {
  restoreDateModes();
  const school = document.getElementById("school-form"),
    root = document.getElementById("session-options"),
    note = el("p", "Select a school to see its classes.", "input-hint");
  root.before(note);
  let generation = 0;
  async function loadSessions() {
    const id = ++generation,
      f = school.elements,
      s = getSchools().find((s) => s.school_code === f.school_code.value);
    root.replaceChildren(el("legend", "Class schedule"));
    const start = f.start_date.value,
      end = f.end_date.value;
    if (!s || !start || !end || start > end) {
      note.textContent = "Select a school and valid dates to see its classes.";
      return;
    }
    note.textContent = "Loading classes…";
    try {
      const rows = await query(
        "fact_daily_session",
        [
          { column: "school_id", op: "eq", value: s.school_id },
          { column: "date", op: "gte", value: start },
          { column: "date", op: "lte", value: end },
        ],
        false,
        [
          { column: "date" },
          { column: "start_time" },
          { column: "session_id" },
        ],
      );
      if (id !== generation) return;
      note.textContent = rows.length
        ? `${rows.length} recorded classes. Cancelled classes cannot be selected again.`
        : "No recorded classes for these dates. You may still request a whole-day cancellation.";
      const dates = [...new Set(rows.map((s) => s.date))];
      for (const date of dates) {
        const group = el("details", "", "session-day");
        group.open = dates.length === 1 || date === dates[0];
        group.append(
          el(
            "summary",
            `${date} · ${rows.filter((s) => s.date === date).length} classes`,
          ),
        );
        const all = button(
          "Select all available classes this day",
          () => {
            f.type.value = "Partial";
            const boxes = [...group.querySelectorAll("input:not(:disabled)")],
              select = boxes.some((b) => !b.checked);
            boxes.forEach((b) => (b.checked = select));
            school.dispatchEvent(new Event("input", { bubbles: true }));
          },
          "text-button",
        );
        group.append(all);
        for (const row of rows.filter((s) => s.date === date)) {
          const label = el("label", "", "session-choice"),
            box = el("input");
          box.type = "checkbox";
          box.name = "sessions";
          box.value = row.session_id;
          box.disabled = cancelled(row);
          box.addEventListener("change", () => {
            if (box.checked) f.type.value = "Partial";
          });
          const text = el("span"),
            title = el(
              "strong",
              `${row.class_name} · ${time(row.start_time)}–${time(row.end_time)}`,
            );
          text.append(title, el("small", teacherName(row.actual_teacher_id)));
          if (category(row) === "covered")
            text.append(
              el("small", `Cover for: ${teacherName(row.original_teacher_id)}`),
            );
          if (cancelled(row))
            text.append(el("small", String(row.status), "attention-note"));
          label.append(box, text);
          group.append(label);
        }
        root.append(group);
      }
    } catch {
      if (id === generation)
        note.textContent =
          "Classes could not be loaded. Retry before choosing sessions. No class selection has been retained.";
    }
  }
  document.getElementById("session-selector").hidden = false;
  document.getElementById("load-sessions").textContent =
    "Refresh class schedule";
  document
    .getElementById("load-sessions")
    .addEventListener("click", loadSessions);
  for (const name of ["school_code", "start_date", "end_date"])
    school.elements[name].addEventListener("change", loadSessions);
  document
    .getElementById("school-form-multi")
    .addEventListener("change", loadSessions);
  school.elements.type.addEventListener("change", () => {
    if (school.elements.type.value === "Whole Day")
      root.querySelectorAll("input").forEach((i) => (i.checked = false));
  });

  const teacher = document.getElementById("teacher-form"),
    warning = el("div", "", "conflict-notice");
  warning.setAttribute("role", "status");
  warning.hidden = true;
  teacher.querySelectorAll("fieldset.form-section")[1].after(warning);
  let checkID = 0;
  async function checkLeave() {
    const current = ++checkID,
      f = teacher.elements;
    warning.replaceChildren();
    warning.hidden = true;
    if (
      !f.teacher_id.value ||
      !f.start_date.value ||
      f.end_date.value < f.start_date.value
    )
      return;
    try {
      const { data } = await api("/requests/conflicts", {
        method: "POST",
        data: {
          teacher_id: f.teacher_id.value,
          start: f.start_date.value,
          end: f.end_date.value,
          startTime: f.startTime.value,
          endTime: f.endTime.value,
        },
      });
      if (current !== checkID) return;
      if (data.length) {
        warning.hidden = false;
        warning.append(el("strong", "Existing records overlap this leave"));
        for (const r of data)
          warning.append(
            el(
              "p",
              `${r.source} · ${r.start_date} to ${r.end_date} · ${r.start_time || "All day"}${r.end_time ? "–" + r.end_time : ""} · ${r.status}`,
            ),
          );
        warning.append(
          el("small", "Check these records before submitting another request."),
        );
      }
    } catch {
      if (current === checkID) {
        warning.hidden = false;
        warning.append(
          el(
            "p",
            "Existing records could not be checked. Please verify with the team before submitting.",
          ),
        );
      }
    }
  }
  for (const name of [
    "teacher_id",
    "start_date",
    "end_date",
    "startTime",
    "endTime",
  ])
    teacher.elements[name].addEventListener("change", checkLeave);
  document
    .getElementById("teacher-form-multi")
    .addEventListener("change", checkLeave);
  for (const [form, category] of [
    [school, "School"],
    [teacher, "Teacher"],
  ]) {
    const history = button("My submission history", async () => {
      const { dialog, body } = modal("My submission history");
      dialog.showModal();
      let offset = 0;
      const list = el("div", "", "history-list"),
        state = el("p", "Loading…");
      body.append(state, list);
      const more = button("Load more", () => load()),
        refresh = button("Refresh", () => {
          offset = 0;
          list.replaceChildren();
          load();
        });
      body.append(refresh, more);
      async function load() {
        more.disabled = true;
        refresh.disabled = true;
        try {
          const result = await api("/line/history", {
            method: "POST",
            data: { category, offset },
            headers: lineRequestHeaders(),
          });
          if (!dialog.isConnected) return;
          for (const r of result.data) {
            const card = el("article", "", "history-card");
            let affected = r.affected_sessions;
            try {
              if (typeof affected === "string") affected = JSON.parse(affected);
            } catch {
              affected = null;
            }
            const heading = el("h3", `#${r.id} `),
              status = el("span", r.status || "Pending", "request-status");
            status.dataset.status = r.status || "Pending";
            heading.append(status);
            card.append(
              heading,
              el(
                "p",
                category === "School"
                  ? r.school_code
                  : teacherName(r.teacher_id),
              ),
              el(
                "p",
                r.start_date === r.end_date
                  ? r.start_date
                  : `${r.start_date} to ${r.end_date}`,
              ),
              el("p", r.type),
            );
            if (Array.isArray(affected))
              card.append(el("p", `${affected.length} selected sessions`));
            else if (affected?.startTime)
              card.append(el("p", `${affected.startTime}–${affected.endTime}`));
            card.append(
              el(
                "small",
                `Submitted ${new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} · Bangkok`,
              ),
            );
            list.append(card);
          }
          offset += result.data.length;
          more.hidden = !result.more;
          state.textContent = offset
            ? "Only requests linked to your verified LINE account are shown."
            : "No submissions linked to this LINE account were found.";
        } catch (e) {
          state.textContent = e.message;
        } finally {
          more.disabled = false;
          refresh.disabled = false;
        }
      }
      await load();
    });
    history.disabled = !hasLineIdentity();
    form.prepend(history);
    if (!hasLineIdentity())
      history.after(
        el(
          "p",
          "Open this form from LINE to see your own submission history.",
          "input-hint",
        ),
      );
  }
  const help = el(
    "p",
    "Teacher missing from the list? Ask an administrator to check the teacher directory before submitting.",
    "input-hint",
  );
  document.getElementById("teacher-select").closest("label").after(help);
}
