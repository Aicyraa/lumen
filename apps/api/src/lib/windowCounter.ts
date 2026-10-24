// Allows at most `max` hits per key in a sliding window. In-memory, so it is per API process (same shortcut as the rate limiter).
export function createWindowCounter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  const sweep = setInterval(() => { // keeps the map from growing with addresses that stopped asking
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) if (v[v.length - 1] <= cutoff) hits.delete(k);
  }, Math.max(windowMs, 1000));
  sweep.unref();
  return {
    // true = this hit is allowed (and counted); false = over the limit (not counted)
    allow(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= max) { hits.set(key, recent); return false; }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
