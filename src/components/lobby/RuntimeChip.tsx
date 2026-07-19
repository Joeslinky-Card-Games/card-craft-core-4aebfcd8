import { useQuery } from "@tanstack/react-query";
import { API_URL, endpoints } from "@/lib/api";
import { estimateRuntime, formatDuration } from "@/lib/format";

export function RuntimeChip({ gameId, players }: { gameId: string; players?: number }) {
  const q = useQuery({
    queryKey: ["runtime", gameId],
    queryFn: () => endpoints.runtime(gameId),
    enabled: Boolean(API_URL) && Boolean(gameId),
    staleTime: 60_000,
  });
  const est = estimateRuntime(q.data, players);
  if (!est) return null;
  const label = formatDuration(est.ms);
  if (!label) return null;
  const suffix =
    est.source === "exact" && est.players
      ? ` · ${est.players}p`
      : est.source === "nearest" && est.players
        ? ` · ~${est.players}p`
        : "";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
      ⏱ {label}
      {suffix}
    </span>
  );
}