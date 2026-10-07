export const time = (value) => String(value || "").slice(0, 5);
export const bangkokDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const teacherType = (t) =>
  String(t?.user_type) === "210"
    ? "FT"
    : String(t?.user_type) === "220"
      ? "PT"
      : "Other";
// School-group colour family, matched loosely so "Thesaban (others)" and
// spacing variants share a colour. Anything unrecognised is neutral.
export function groupTone(group) {
  const g = String(group || "").toLowerCase();
  if (g.includes("thesaban")) return "thesaban";
  if (g.includes("private")) return "private";
  if (/obec\s*3/.test(g)) return "obec3";
  if (g.includes("obec south")) return "obecsouth";
  return "other";
}
// Same rule as supabase/functions/_shared/sessions.mjs: a class marked as
// deleted in TMS (removed_at) is left out; and on a past day, a class not
// refreshed on that day was removed from TMS after it was first seen, unless
// nothing at all was refreshed that day (sync outage).
export function confirmedSessions(sessions, today = bangkokDay()) {
  const refreshed = (s) =>
    !!s.last_updated && String(s.last_updated).slice(0, 10) >= s.date;
  const confirmedDays = new Set(
    sessions.filter((s) => s.date < today && refreshed(s)).map((s) => s.date),
  );
  return sessions.filter(
    (s) =>
      !s.removed_at &&
      (s.date >= today || !confirmedDays.has(s.date) || refreshed(s)),
  );
}
export const teacherActive = (t) =>
  /^(active|enabled)$/i.test(String(t?.status || "").trim());
export const displayName = (u) =>
  [u?.firstname_en, u?.lastname_en].filter(Boolean).join(" ") ||
  u?.nickname_en ||
  u?.user_id ||
  "Unassigned";
export function category(s) {
  const status = String(s.status || "").toLowerCase();
  if (status.startsWith("cancel"))
    return status.includes("school")
      ? "school-cancelled"
      : status.includes("bc")
        ? "bc-cancelled"
        : "cancelled";
  if (
    status.includes("substitut") ||
    status === "cover" ||
    (s.actual_teacher_id &&
      s.original_teacher_id &&
      s.actual_teacher_id !== s.original_teacher_id)
  )
    return "covered";
  return "normal";
}
export const cancelled = (s) => category(s).includes("cancelled");
export function inProgress(s, now = new Date()) {
  if (
    cancelled(s) ||
    s.date !== bangkokDay(now) ||
    !s.start_time ||
    !s.end_time
  )
    return false;
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return time(s.start_time) <= value && value < time(s.end_time);
}
export function leaveOverlaps(s, leave) {
  return (
    s.date >= leave.start_date &&
    s.date <= leave.end_date &&
    (!leave.start_time ||
      !leave.end_time ||
      (time(s.start_time) < time(leave.end_time) &&
        time(leave.start_time) < time(s.end_time)))
  );
}
export function decorateSessions(sessions, users, schools, assignments = []) {
  const userMap = new Map(users.map((u) => [String(u.user_id), u]));
  const schoolMap = new Map(schools.map((s) => [String(s.school_id), s]));
  return sessions
    .map((s) => {
      const school = schoolMap.get(String(s.school_id)) || {};
      const teacher = userMap.get(String(s.actual_teacher_id));
      const coords = assignments.filter(
        (a) =>
          String(a.school_id) === String(s.school_id) &&
          a.is_active !== false &&
          (!a.start_date || a.start_date <= s.date) &&
          (!a.end_date || a.end_date >= s.date),
      );
      return {
        ...s,
        category: category(s),
        teacher: displayName(teacher || { user_id: s.actual_teacher_id }),
        original: displayName(
          userMap.get(String(s.original_teacher_id)) || {
            user_id: s.original_teacher_id,
          },
        ),
        teacherType: teacherType(teacher),
        school:
          [school.school_code, school.school_name_en || school.school_name_th]
            .filter(Boolean)
            .join(" · ") ||
          s.school_id ||
          "Unknown school",
        group: school.school_group || "Other",
        coordinator:
          [
            ...new Set(
              coords.map((a) =>
                displayName(
                  userMap.get(String(a.user_id)) || { user_id: a.user_id },
                ),
              ),
            ),
          ].join(", ") || "Unassigned",
      };
    })
    .sort(
      (a, b) =>
        time(a.start_time).localeCompare(time(b.start_time)) ||
        String(a.session_id).localeCompare(String(b.session_id)),
    );
}
export const statusLabel = (s) =>
  ({
    normal: "Scheduled",
    covered: "Cover",
    "school-cancelled": "Cancelled · School",
    "bc-cancelled": "Cancelled · Braincloud",
    cancelled: "Cancelled · Unspecified",
  })[category(s)];
