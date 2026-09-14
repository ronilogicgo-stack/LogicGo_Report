/** Helpers for date-aware pause/resume visibility.
 * History rows look like { status: 'approved'|'paused', effective_date: 'YYYY-MM-DD' }.
 * Before a person's first history row, they're assumed to have always
 * been approved (default) - a history row only exists once an Admin
 * pauses or resumes them for the first time.
 */

/** True if this person was active (approved, not paused) on dateStr. */
export function isActiveOnDate(history, dateStr) {
  if (!history || history.length === 0) return true;
  const sorted = [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  let current = true;
  for (const h of sorted) {
    if (h.effective_date > dateStr) break;
    current = h.status === "approved";
  }
  return current;
}

/** True if this person was active on AT LEAST ONE day within [fromStr, toStr]
 * (inclusive) - used for date-range reports so a person who was paused
 * for only part of the range still shows up. */
export function wasActiveDuringRange(history, fromStr, toStr) {
  if (!history || history.length === 0) return true;
  const checkpoints = new Set([fromStr, toStr]);
  for (const h of history) {
    if (h.effective_date >= fromStr && h.effective_date <= toStr) {
      checkpoints.add(h.effective_date);
    }
  }
  for (const cp of checkpoints) {
    if (isActiveOnDate(history, cp)) return true;
  }
  return false;
}
