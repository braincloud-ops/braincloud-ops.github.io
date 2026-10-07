const clockTime = (v) => String(v || "").slice(0, 5);
export const overlaps = (a, b, c, d) =>
  clockTime(a) < clockTime(d) && clockTime(c) < clockTime(b);
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
      (!proposed && /^cancelled/i.test(String(s.status)))
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
