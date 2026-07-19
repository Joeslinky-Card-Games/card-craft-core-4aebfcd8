import { Button } from "@/components/ui/button";
import type { Match } from "@/lib/api";

const STATUS_LABEL: Record<Match["status"], string> = {
  open: "Waiting for players",
  "in-progress": "In progress",
  "round-complete": "Between rounds",
  complete: "Finished",
};

const STATUS_TONE: Record<Match["status"], string> = {
  open: "bg-emerald-500/15 text-emerald-500",
  "in-progress": "bg-primary/15 text-primary",
  "round-complete": "bg-amber-500/15 text-amber-500",
  complete: "bg-muted text-muted-foreground",
};

function formatCreated(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function MyTableRow({
  match,
  gameName,
  showGameName = true,
  onRejoin,
}: {
  match: Match;
  gameName?: string;
  showGameName?: boolean;
  onRejoin: () => void;
}) {
  const names = match.players.map(
    (id) => match.usernames?.[id] ?? "Player",
  );
  return (
    <li className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showGameName && gameName && (
            <span className="font-medium">{gameName}</span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_TONE[match.status]}`}
          >
            {STATUS_LABEL[match.status]}
          </span>
          {match.visibility === "private" && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-500">
              Private
            </span>
          )}
          {match.code && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
              {match.code}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {match.players.length}/{match.maxPlayers}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {names.length > 0 ? names.join(", ") : "No players yet"}
        </div>
        <div className="text-[11px] text-muted-foreground/80">
          Created {formatCreated(match.createdAt)}
        </div>
      </div>
      <Button size="sm" onClick={onRejoin} className="self-start sm:self-auto">
        Rejoin
      </Button>
    </li>
  );
}