export function initializeLearning({ api, busy, message, table }) {
  const $ = (id) => document.getElementById(id);
  $("learning-options").addEventListener("click", () =>
    busy($("learning-options"), async () => {
      const { data } = await api("/reports/learning/options");
      for (const [id, values] of [
        ["learning-year", data.years],
        ["learning-schools", data.schools],
      ]) {
        $(id).replaceChildren();
        for (const value of values) {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = value;
          $(id).append(o);
        }
      }
      message(
        data.years.length
          ? "Available reporting years loaded."
          : "No reporting years are available.",
      );
    }),
  );
  const flat = (r) => ({
    ...r,
    active_weeks: r.weeks.active,
    zero_weeks: r.weeks.zero,
    unknown_weeks: r.weeks.unknown,
    active_percent:
      r.weeks.active_percent == null
        ? "Not available"
        : r.weeks.active_percent + "%",
    active_topics: r.topics.active,
    zero_topics: r.topics.zero,
    unknown_topics: r.topics.unknown,
  });
  const metrics = [
    ["active_weeks", "Active weeks"],
    ["zero_weeks", "Zero weeks"],
    ["unknown_weeks", "Unknown weeks"],
    ["active_percent", "Active / known weeks"],
    ["active_topics", "Active topics"],
    ["zero_topics", "Zero topics"],
    ["unknown_topics", "Unknown topics"],
  ];
  $("learning-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      $("learning-output").hidden = true;
      $("learning-details").replaceChildren();
      $("learning-summary").replaceChildren();
      $("learning-note").textContent = "Loading listening activity…";
      try {
        const form = e.target.elements;
        const { data } = await api("/reports/learning", {
          method: "POST",
          data: {
            year: form.year.value,
            term: form.term.value,
            schools: [...form.schools.selectedOptions].map((o) => o.value),
          },
        });
        if (!data.schools.length) {
          $("learning-note").textContent =
            "No matching activity records. This does not establish zero participation.";
          return;
        }
        const q = data.quality;
        $("learning-note").textContent =
          `Academic year ${data.year} · Latest source update: ${data.last_updated || "Not available"}. ${q.invalid_records} invalid source records, ${q.conflicting_cells} conflicting cells, ${q.unclassified_headers} headers without a recognized term. Unclassified headers appear only when all terms are selected.`;
        table(
          "learning-summary",
          [["school", "School"], ...metrics],
          data.schools.map(flat),
        );
        for (const [i, school] of data.schools.entries()) {
          const detail = document.createElement("details"),
            title = document.createElement("summary");
          title.textContent = school.school;
          detail.append(title);
          const grade = document.createElement("div");
          grade.id = `learning-grade-${i}`;
          grade.className = "table-wrap";
          detail.append(grade);
          const classes = document.createElement("div");
          classes.id = `learning-class-${i}`;
          classes.className = "table-wrap";
          detail.append(classes);
          $("learning-details").append(detail);
          table(
            grade.id,
            [["grade", "Grade"], ["class_count", "Classes"], ...metrics],
            school.grades.map(flat),
          );
          const selected = school.classes.filter(
            (c) =>
              !form.review_only.checked ||
              c.weeks.zero +
                c.weeks.unknown +
                c.topics.zero +
                c.topics.unknown >
                0,
          );
          table(
            classes.id,
            [["class_name", "Class"], ...metrics],
            selected.map(flat),
          );
          for (const cls of selected) {
            const missing = document.createElement("details"),
              heading = document.createElement("summary");
            heading.textContent = `${cls.class_name}: review weeks and topics`;
            missing.append(heading);
            for (const [label, values] of [
              ["Zero weeks", cls.weeks.zero_headers],
              ["Unknown weeks", cls.weeks.unknown_headers],
              ["Zero topics", cls.topics.zero_headers],
              ["Unknown topics", cls.topics.unknown_headers],
            ]) {
              const p = document.createElement("p");
              p.textContent = `${label}: ${values.join("; ") || "None recorded"}`;
              missing.append(p);
            }
            detail.append(missing);
          }
        }
        $("learning-output").hidden = false;
        message("Learning report loaded.");
      } catch (error) {
        $("learning-note").textContent =
          "Learning report could not be loaded. Previous results were cleared.";
        throw error;
      }
    });
  });
}
