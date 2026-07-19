import type { RuntimeStats } from "@/lib/api";

/** Format ms as e.g. "~18 min" or "~1h 5m". Returns null for empty/invalid input. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `~${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

/**
 * Pick the best-fit average from runtime stats for a target player count.
 * Falls back to the nearest bucket with data, then to the overall average.
 * Returns null when no data exists at all.
 */
export function estimateRuntime(
  stats: RuntimeStats | undefined | null,
  players?: number | null,
): { ms: number; source: "exact" | "nearest" | "overall"; players?: number } | null {
  if (!stats) return null;
  const buckets = Object.entries(stats.byPlayers)
    .map(([k, v]) => ({ n: Number(k), avgMs: v.avgMs, count: v.count }))
    .filter((b) => Number.isFinite(b.n) && b.count > 0);

  if (players && buckets.length > 0) {
    const exact = buckets.find((b) => b.n === players);
    if (exact) return { ms: exact.avgMs, source: "exact", players: exact.n };
    const nearest = buckets.slice().sort(
      (a, b) => Math.abs(a.n - players) - Math.abs(b.n - players),
    )[0];
    if (nearest) return { ms: nearest.avgMs, source: "nearest", players: nearest.n };
  }

  if (stats.overallAvgMs && stats.totalCount > 0) {
    return { ms: stats.overallAvgMs, source: "overall" };
  }
  if (buckets.length > 0) {
    // Weighted overall from buckets.
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    const totalMs = buckets.reduce((s, b) => s + b.avgMs * b.count, 0);
    return { ms: Math.round(totalMs / totalCount), source: "overall" };
  }
  return null;
}