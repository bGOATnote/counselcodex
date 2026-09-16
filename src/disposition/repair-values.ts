/** Exact structural equality for validated JSON-shaped repair values.
 * Shared with browser provenance verification: no Node/runtime dependencies,
 * trimming, string normalization, unordered arrays or semantic equivalence.
 */
export function sameRepairValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, index) => sameRepairValue(value, b[index]));
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key)
    && sameRepairValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
