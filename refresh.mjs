// Load pacing (owner approved 16 Nov 2026, after the Disk IO outage).
// The schedule sync refreshes classes every 5 minutes, so the pages load data
// every 5 minutes and only redraw every minute ("In progress" uses the clock).
export const DATA_EVERY = 5 * 60000;

// People, schools and coordinator assignments change rarely; every page and
// every refresh used to fetch them again. Kept for an hour per browser tab.
export const REFERENCE_FOR = 60 * 60000;
const REFERENCE = new Set(["dim_user", "dim_school", "ref_assignment"]);

// Wraps the public query helper. Only unfiltered, non-admin reads of the
// reference tables are kept; everything else goes straight to the server.
// `forget()` drops the copies (the "Refresh day" buttons call it).
export function cachedQuery(
  query,
  { now = () => Date.now(), keepFor = REFERENCE_FOR } = {},
) {
  const kept = new Map();
  const wrapped = (table, filters = [], admin = false, order = []) => {
    if (admin || filters?.length || !REFERENCE.has(table))
      return query(table, filters, admin, order);
    const key = table + "|" + JSON.stringify(order || []);
    let hit = kept.get(key);
    if (!hit || now() - hit.at >= keepFor) {
      hit = { at: now(), rows: query(table, filters, admin, order) };
      kept.set(key, hit);
      // A failed read is not kept, so the next call asks again.
      hit.rows.catch(() => {
        if (kept.get(key) === hit) kept.delete(key);
      });
    }
    return hit.rows.then((rows) => rows.slice());
  };
  wrapped.forget = () => kept.clear();
  return wrapped;
}

// True when a page should fetch again on its minute tick.
export const due = (lastLoad, now = Date.now()) =>
  !lastLoad || now - lastLoad >= DATA_EVERY;
