// One field for typing and choosing (WAI-ARIA editable combobox with a list).
// The native <select> stays in the form as the value holder, so FormData,
// form.elements[name], review dialogs and existing "change" listeners keep
// working. Typing filters; focusing or tapping shows the full list.
let uid = 0;
const normalise = (s) =>
  String(s || "")
    .toLocaleLowerCase()
    .normalize("NFC");

/**
 * @param {HTMLSelectElement} select
 * @param {{
 *   items: {value:string,label:string,detail?:string,meta?:string,tone?:string,
 *           search?:string,section?:string,hiddenUntilSearch?:boolean}[],
 *   placeholder?: string, emptyText?: string, invalidText?: string
 * }} options
 */
export function combobox(select, options) {
  const label = select.closest("label");
  const id = "combo-" + ++uid;
  let items, byValue;
  // Keep the select's options in step with the items so the select alone
  // remains a complete, valid value holder.
  function setItems(list) {
    const kept = select.value;
    items = list.map((item) => ({
      ...item,
      key: normalise(
        [item.label, item.detail, item.meta, item.section, item.search].join(
          " ",
        ),
      ),
    }));
    byValue = new Map(items.map((item) => [item.value, item]));
    select.replaceChildren(new Option(options.placeholder || "", ""));
    for (const item of items) select.append(new Option(item.label, item.value));
    select.value = byValue.has(kept) ? kept : "";
  }
  setItems(options.items);
  const required = select.required;
  select.required = false;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.classList.add("visually-hidden");

  const wrap = document.createElement("div");
  wrap.className = "combo";
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.className = "combo-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = options.placeholder || "";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", id + "-list");
  if (required) input.setAttribute("aria-required", "true");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "combo-clear";
  clear.setAttribute("aria-label", "Clear selection");
  clear.textContent = "×";
  clear.hidden = true;
  const list = document.createElement("ul");
  list.id = id + "-list";
  list.className = "combo-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  const note = document.createElement("small");
  note.className = "search-result-note";
  note.setAttribute("role", "status");
  wrap.append(input, clear, list);
  select.after(wrap);
  wrap.after(note);
  if (label) label.htmlFor = id;

  let shown = [],
    active = -1,
    typed = false;

  function commitText() {
    const item = byValue.get(select.value);
    input.value = item ? item.label : "";
    wrap.dataset.tone = item?.tone || "";
    clear.hidden = !select.value;
    input.setCustomValidity(
      required && !select.value
        ? options.invalidText || "Choose an option from the list."
        : "",
    );
  }
  function render(term) {
    const tokens = normalise(term).split(/\s+/).filter(Boolean);
    shown = items.filter(
      (item) =>
        (tokens.length || !item.hiddenUntilSearch) &&
        tokens.every((t) => item.key.includes(t)),
    );
    list.replaceChildren();
    let section = null;
    shown.forEach((item, index) => {
      if ((item.section || null) !== section) {
        section = item.section || null;
        if (section) {
          const heading = document.createElement("li");
          heading.className = "combo-heading";
          heading.setAttribute("role", "presentation");
          heading.textContent = section;
          list.append(heading);
        }
      }
      const li = document.createElement("li");
      li.id = `${id}-opt-${index}`;
      li.className = "combo-option";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(item.value === select.value));
      li.dataset.index = index;
      if (item.tone) li.dataset.tone = item.tone;
      const main = document.createElement("span");
      main.className = "combo-main";
      main.textContent = item.label;
      li.append(main);
      if (item.meta) {
        const meta = document.createElement("span");
        meta.className = "combo-meta";
        meta.textContent = item.meta;
        li.append(meta);
      }
      if (item.detail) {
        const detail = document.createElement("span");
        detail.className = "combo-detail";
        detail.textContent = item.detail;
        li.append(detail);
      }
      list.append(li);
    });
    if (!shown.length) {
      const empty = document.createElement("li");
      empty.className = "combo-empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = options.emptyText || "No matches";
      list.append(empty);
    }
    note.textContent = tokens.length
      ? `${shown.length} matching options${select.value ? "; your selection is kept" : ""}.`
      : "";
    setActive(
      Math.max(
        0,
        shown.findIndex((item) => item.value === select.value),
      ),
      false,
    );
  }
  function setActive(index, scroll = true) {
    active = shown.length ? Math.max(0, Math.min(index, shown.length - 1)) : -1;
    for (const li of list.querySelectorAll(".combo-option"))
      li.classList.toggle("is-active", Number(li.dataset.index) === active);
    const current =
      active >= 0 ? list.querySelector(`#${id}-opt-${active}`) : null;
    if (current) {
      input.setAttribute("aria-activedescendant", current.id);
      if (scroll) current.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function open(term = "") {
    render(term);
    list.hidden = false;
    wrap.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }
  function close() {
    list.hidden = true;
    wrap.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    typed = false;
  }
  function choose(item) {
    const changed = select.value !== item.value;
    select.value = item.value;
    commitText();
    close();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  input.addEventListener("focus", () => {
    input.select();
    open();
  });
  input.addEventListener("click", () => {
    if (list.hidden) open();
  });
  input.addEventListener("input", () => {
    typed = true;
    open(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) open(typed ? input.value : "");
      else setActive(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !list.hidden) {
      if (shown[active]) {
        event.preventDefault();
        choose(shown[active]);
      }
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      commitText();
      close();
    } else if (event.key === "Tab") {
      if (typed && shown.length === 1) choose(shown[0]);
      else {
        commitText();
        close();
      }
    }
  });
  input.addEventListener("blur", () => {
    // Let an option click finish first; then restore the committed label.
    setTimeout(() => {
      if (document.activeElement === input) return;
      commitText();
      close();
    }, 120);
  });
  // Keep focus in the input while choosing with a pointer.
  list.addEventListener("pointerdown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    // The list sits inside the field's <label>: without this, the label
    // forwards the click to the input, which reopens the list just closed.
    event.preventDefault();
    const li = event.target.closest(".combo-option");
    if (li) choose(shown[Number(li.dataset.index)]);
  });
  clear.addEventListener("click", () => {
    select.value = "";
    commitText();
    select.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });
  // Programmatic changes (tests, resets, other scripts) update the text.
  select.addEventListener("change", commitText);
  commitText();
  return {
    input,
    refresh: commitText,
    labelFor: (value) => byValue.get(value)?.label || "",
    // Replace the choices (for example when another filter narrows them).
    setItems(next) {
      setItems(next);
      commitText();
      if (!list.hidden) close();
    },
  };
}
