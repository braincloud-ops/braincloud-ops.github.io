export function installSearch(id, label, placeholder) {
  const select = document.getElementById(id);
  const choices = [...select.options].map((option) => option.cloneNode(true));
  const searchLabel = document.createElement("label");
  searchLabel.className = "lookup-search";
  const title = document.createElement("span");
  title.className = "visually-hidden";
  title.textContent = label;
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = placeholder;
  search.autocomplete = "off";
  search.setAttribute("aria-controls", id);
  const results = document.createElement("small");
  results.className = "search-result-note";
  results.setAttribute("role", "status");
  searchLabel.append(title, search, results);
  select.closest("label").before(searchLabel);
  search.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase();
    const previous = select.value;
    const matches = choices
      .slice(1)
      .filter((option) =>
        option.textContent.toLocaleLowerCase().includes(term),
      );
    const keep = choices.find((option) => option.value === previous);
    const shown = [...matches];
    if (previous && keep && !shown.some((option) => option.value === previous))
      shown.unshift(keep);
    select.replaceChildren(
      choices[0].cloneNode(true),
      ...shown.map((option) => option.cloneNode(true)),
    );
    select.value = previous;
    results.textContent = term
      ? `${matches.length} matching options${previous ? "; your selection is kept" : ""}.`
      : "";
  });
}

export function improveFormDates() {
  for (const form of document.forms) {
    const start = form.elements.start_date || form.elements.start;
    const end = form.elements.end_date || form.elements.end;
    if (!start || !end || start.getAttribute("type") !== "date") continue;
    const check = () => {
      end.min = start.value;
      end.setCustomValidity(
        end.value && start.value && end.value < start.value
          ? "End date must be on or after the start date."
          : "",
      );
    };
    const updateStart = () => {
      if (start.value && (!end.value || end.value < start.value))
        end.value = start.value;
      check();
    };
    start.addEventListener("input", updateStart);
    start.addEventListener("change", updateStart);
    end.addEventListener("input", check);
    end.addEventListener("change", check);
  }
}

export function showSubmissionReceipt(form, result, onAnother) {
  let receipt = form.querySelector(".submission-receipt");
  if (!receipt) {
    receipt = document.createElement("div");
    receipt.className = "submission-receipt";
    receipt.setAttribute("role", "status");
    receipt.tabIndex = -1;
    form.append(receipt);
  }
  receipt.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Request received";
  const detail = document.createElement("p");
  detail.textContent = `Request #${result.id} · Pending review`;
  const note = document.createElement("p");
  note.textContent =
    "Your request is saved. There is no need to submit it again.";
  receipt.append(heading, detail, note);
  if (onAnother) {
    const another = document.createElement("button");
    another.type = "button";
    another.className = "secondary";
    another.textContent = "Submit another request";
    another.addEventListener("click", () => {
      receipt.remove();
      onAnother();
    });
    receipt.append(another);
  }
  if (
    document.body.classList.contains("liff-app") &&
    window.liff?.isInClient?.()
  ) {
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.addEventListener("click", () => window.liff.closeWindow());
    receipt.append(done);
  }
  receipt.focus({ preventScroll: true });
  receipt.scrollIntoView({ block: "nearest", behavior: "instant" });
}
