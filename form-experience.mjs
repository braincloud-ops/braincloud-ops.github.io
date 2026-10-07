import { character } from "./characters.mjs?v=c0f77fa1234b";
import { burst } from "./motion.mjs?v=c0f77fa1234b";

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
  receipt.append(
    character(form.id === "teacher-form" ? "girl-cheer" : "robot-b-cheer", {
      eager: true,
    }),
  );
  burst(receipt);
  receipt.focus({ preventScroll: true });
  receipt.scrollIntoView({ block: "nearest", behavior: "instant" });
}
