// Access & activity (Admin). Owners give company accounts a level of access
// and read everything everyone changed; anyone else sees their own changes.
// Permissions are checked by the server on every request (migration
// 202610080019); this screen only edits and explains them.
import { el, button } from "./dom.mjs?v=45e5b57cfced";
import { emptyState } from "./characters.mjs?v=45e5b57cfced";

const LEVELS = [
  ["hr", "HR: leave details"],
  ["coordinator", "Coordinator"],
  ["manager", "Manager"],
  ["full", "Full access"],
  ["owner", "Owner"],
  ["custom", "Custom"],
];
export const levelLabel = (preset) =>
  preset === "password"
    ? "Emergency password"
    : (LEVELS.find(([key]) => key === preset)?.[1] ?? "Custom");

const TYPES = [
  ["", "All changes"],
  ["request", "Requests"],
  ["person", "People"],
  ["school", "Schools"],
  ["alarm", "Reminders"],
  ["access", "Access"],
  ["teacher.profile", "Teacher profile views"],
  ["finance.export", "Payment exports"],
  ["attendance.export", "Attendance exports"],
  ["admin.signin", "Administrator sign-ins"],
  ["viewer.signin", "Team calendar sign-ins"],
];
function describe(row) {
  const id = row.record_id ?? "";
  return (
    {
      "request.update": `Edited request #${id}`,
      "request.handled": `Marked request #${id} handled`,
      "request.unhandled": `Reopened request #${id}`,
      "person.create": `Added person ${id}`,
      "person.update": `Edited person ${id}`,
      "school.create": `Added school ${id}`,
      "school.update": `Edited school ${id}`,
      "alarm.save": "Saved a reminder",
      "access.grant": row.after_data
        ? `Set access for ${id}`
        : `Removed access for ${id}`,
      "admin.signin": "Signed in to Admin",
      "viewer.signin": "Signed in to the team calendar",
      "finance.export": "Downloaded a payment draft",
      "attendance.export": "Exported connections",
      "email.test": "Sent a test email",
      "teacher.profile.view": `Viewed teacher profile ${id}`,
    }[row.action] || row.action
  );
}
const who = (row) =>
  row.actor_email ||
  {
    password: "Administrator password",
    system: "System",
    staff: "Staff",
  }[row.actor_kind] ||
  "Unknown";
const when = (iso) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
// Fields that changed, oldest value first. Bookkeeping fields are left out.
const SKIP = new Set([
  "revision",
  "updated_at",
  "created_at",
  "last_edited_by",
]);
const show = (v) => {
  if (v == null || v === "") return "—";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 140 ? text.slice(0, 137) + "…" : text;
};
export function changedFields(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  return [...keys]
    .filter((k) => !SKIP.has(k))
    .filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map((k) => [k, before?.[k], after?.[k]]);
}

export function initializeAccess({ api, busy, message, can, me }) {
  const root = document.getElementById("access-root");
  let info = null; // { grants, permissions, presets } for owners
  let offset = 0;
  let started = false;

  function start() {
    if (started) return;
    started = true;
    render();
  }
  function clear() {
    started = false;
    info = null;
    offset = 0;
    root.replaceChildren();
  }
  async function render() {
    root.replaceChildren();
    const owner = can("access.manage");
    document.getElementById("access-title").textContent = owner
      ? "Access & activity"
      : "My activity";
    if (owner) {
      const people = el("section", "", "access-people");
      people.append(
        el("h3", "People with access"),
        el(
          "p",
          "Everyone with a company Google account can already see the team calendar. Add people here only to let them see more or make changes.",
          "muted-line",
        ),
      );
      const list = el("div", "", "access-list");
      const add = button("Add person", () => openEditor(list, null), "");
      people.append(add, list);
      root.append(people);
      await loadPeople(list);
    } else {
      const s = me();
      root.append(
        el(
          "p",
          `You are signed in as ${s.email || "the emergency administrator"} with ${levelLabel(s.preset)} access. Ask an owner if you need more.`,
          "muted-line",
        ),
      );
    }
    root.append(activitySection(owner));
  }

  // ── People ──
  async function loadPeople(list) {
    list.replaceChildren(el("p", "Loading…", "muted-line"));
    try {
      ({ data: info } = await api("/admin/access"));
    } catch (error) {
      list.replaceChildren(el("p", error.message, "muted-line"));
      return;
    }
    list.replaceChildren();
    for (const g of info.grants) list.append(personRow(list, g));
  }
  function personRow(list, g) {
    const row = el("article", "", "access-person");
    const head = el("div", "", "access-person-head");
    head.append(
      el("strong", g.email),
      el("span", levelLabel(g.preset), "access-level"),
    );
    const perms = el(
      "p",
      info.permissions
        .filter((p) => g.permissions.includes(p.key))
        .map((p) => p.label)
        .join(" · "),
      "access-perms",
    );
    const meta = el(
      "p",
      [
        g.note,
        g.updated_by &&
          `Changed by ${g.updated_by}${g.updated_at ? ", " + when(g.updated_at) : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
      "muted-line",
    );
    const tools = el("div", "", "request-tools");
    tools.append(
      button("Change", () => openEditor(list, g, row), "secondary small"),
      button(
        "Remove",
        (event) => {
          if (!confirm(`Remove all access for ${g.email}?`)) return;
          busy(event.currentTarget, async () => {
            await api("/admin/access", {
              method: "POST",
              data: { email: g.email, permissions: [] },
            });
            message(`Access removed for ${g.email}.`);
            await loadPeople(list);
          });
        },
        "secondary small",
      ),
    );
    row.append(head, perms, meta, tools);
    return row;
  }
  function openEditor(list, grant, replace) {
    root.querySelector(".access-editor")?.remove();
    const form = el("form", "", "access-editor");
    form.append(
      el("h4", grant ? `Change access: ${grant.email}` : "Add person"),
    );
    const email = el("input");
    email.type = "email";
    email.name = "email";
    email.required = true;
    email.placeholder = "name@braincloudlearning.com";
    email.value = grant?.email || "";
    email.readOnly = !!grant;
    const emailLabel = el("label", "Company email");
    emailLabel.append(email);
    const level = el("select");
    level.name = "preset";
    for (const [key, label] of LEVELS) {
      const o = el("option", label);
      o.value = key;
      level.append(o);
    }
    const levelLabelEl = el("label", "Level");
    levelLabelEl.append(level);
    const boxes = el("fieldset", "", "access-boxes");
    boxes.append(el("legend", "What they can do"));
    const checks = info.permissions.map((p) => {
      const box = el("input");
      box.type = "checkbox";
      box.value = p.key;
      const label = el("label", "", "check-line");
      label.append(box, " " + p.label);
      boxes.append(label);
      return box;
    });
    const selected = () => checks.filter((c) => c.checked).map((c) => c.value);
    const fill = (keys) =>
      checks.forEach((c) => (c.checked = keys.includes(c.value)));
    const matchPreset = () => {
      const keys = selected().sort().join();
      const found = Object.entries(info.presets).find(
        ([, list]) => [...list].sort().join() === keys,
      );
      level.value = found ? found[0] : "custom";
    };
    level.addEventListener("change", () => {
      if (info.presets[level.value]) fill(info.presets[level.value]);
    });
    boxes.addEventListener("change", matchPreset);
    if (grant) {
      fill(grant.permissions);
      matchPreset();
    } else {
      level.value = "coordinator";
      fill(info.presets.coordinator);
    }
    const note = el("input");
    note.name = "note";
    note.maxLength = 200;
    note.value = grant?.note || "";
    const noteLabel = el("label", "Note (optional)");
    noteLabel.append(note);
    const save = el("button", "Save access");
    save.type = "submit";
    const cancel = button("Cancel", () => form.remove(), "secondary");
    const actions = el("div", "", "request-tools");
    actions.append(save, cancel);
    form.append(emailLabel, levelLabelEl, boxes, noteLabel, actions);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!selected().length)
        return message(
          "Choose at least one permission, or use Remove to take access away.",
          true,
        );
      busy(save, async () => {
        await api("/admin/access", {
          method: "POST",
          data: {
            email: email.value,
            permissions: selected(),
            preset: level.value,
            note: note.value,
          },
        });
        message(`Access saved for ${email.value.trim().toLowerCase()}.`);
        form.remove();
        await loadPeople(list);
      });
    });
    if (replace) replace.after(form);
    else list.before(form);
    (grant ? level : email).focus();
  }

  // ── Activity ──
  function activitySection(owner) {
    const section = el("section", "", "access-activity");
    section.append(
      el("h3", owner ? "Activity" : "Your changes"),
      el(
        "p",
        owner
          ? "Who changed what, newest first. Open a row to see the values before and after."
          : "What you changed, newest first. Open a row to see the values before and after.",
        "muted-line",
      ),
    );
    const form = el("form", "", "inline-form access-filters");
    const field = (label, input) => {
      const l = el("label", label);
      l.append(input);
      form.append(l);
      return input;
    };
    let person = null;
    if (owner) {
      person = el("select");
      person.name = "email";
      const options = [
        ["", "Everyone"],
        ["password", "Administrator password"],
        ...(info?.grants || []).map((g) => [g.email, g.email]),
      ];
      for (const [value, label] of options) {
        const o = el("option", label);
        o.value = value;
        person.append(o);
      }
      field("Person", person);
    }
    const type = el("select");
    for (const [value, label] of TYPES) {
      const o = el("option", label);
      o.value = value;
      type.append(o);
    }
    field("Type", type);
    const start = el("input");
    start.type = "date";
    field("From", start);
    const end = el("input");
    end.type = "date";
    field("To", end);
    const go = el("button", "Show activity");
    go.type = "submit";
    form.append(go);
    const list = el("div", "", "activity-list");
    const more = button("Show older", () => load(false), "secondary");
    more.hidden = true;
    section.append(form, list, more);
    async function load(fresh) {
      if (fresh) {
        offset = 0;
        list.replaceChildren();
      }
      const { data, more: hasMore } = await api("/admin/activity", {
        method: "POST",
        data: {
          email: person?.value || null,
          action: type.value || null,
          start: start.value || null,
          end: end.value || null,
          offset,
        },
      });
      offset += data.length;
      if (fresh && !data.length)
        list.append(
          emptyState("No activity matches these filters.", "boy-neutral"),
        );
      for (const row of data) list.append(activityRow(row));
      more.hidden = !hasMore;
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(go, () => load(true));
    });
    load(true).catch((error) => message(error.message, true));
    return section;
  }
  function activityRow(row) {
    const item = el("details", "", "activity-row");
    const summary = el("summary");
    summary.append(
      el("span", when(row.at), "activity-when"),
      el("strong", who(row), "activity-who"),
      el("span", describe(row), "activity-what"),
    );
    item.append(summary);
    const fields = changedFields(row.before_data, row.after_data);
    if (fields.length) {
      const table = el("table", "", "activity-diff");
      const head = el("tr");
      head.append(el("th", "Field"), el("th", "Before"), el("th", "After"));
      table.append(head);
      for (const [key, before, after] of fields.slice(0, 20)) {
        const tr = el("tr");
        tr.append(el("td", key), el("td", show(before)), el("td", show(after)));
        table.append(tr);
      }
      const wrap = el("div", "", "table-wrap");
      wrap.append(table);
      item.append(wrap);
    } else item.append(el("p", "No field changes recorded.", "muted-line"));
    return item;
  }

  return { start, clear, refresh: () => started && render() };
}
