import type { Hit, Retrieval } from "./model.ts";

/** V25 selection, shared verbatim by generation and release verification.
 * Duplicate IDs retain insertion order but take the latest encountered Hit,
 * including query-specific score metadata. This is not a ranking change. */
export function selectGraphEvidence(packets: Retrieval[], limit: number, pinned: Hit[] = []): Hit[] {
  const selected = new Map(pinned.map(h => [h.chunk.id, h]));
  for (let rank = 0; rank < Math.max(0, ...packets.map(p => p.hits.length)); rank++) for (const packet of packets) {
    if (selected.size >= limit) return [...selected.values()].slice(0, limit);
    const hit = packet.hits[rank]; if (hit) selected.set(hit.chunk.id, hit);
  }
  return [...selected.values()].slice(0, limit);
}
