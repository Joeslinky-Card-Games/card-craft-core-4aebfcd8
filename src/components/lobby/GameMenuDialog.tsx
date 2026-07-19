import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  API_URL,
  endpoints,
  useApi,
  type CreateMatchPayload,
  type Game,
  type Match,
} from "@/lib/api";
import { estimateRuntime, formatDuration } from "@/lib/format";
import { useClerkIdentity } from "@/lib/identity";
import { CreateTableDialog } from "@/components/lobby/CreateTableDialog";
import { Leaderboard } from "@/components/lobby/Leaderboard";
import { RulesContent } from "@/components/game/RulesDialog";

type Props = {
  game: Game | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  games: Game[];
  onJoinTable: () => void;
  myMatches: Match[];
};

export function GameMenuDialog({
  game,
  open,
  onOpenChange,
  games,
  onJoinTable,
  myMatches,
}: Props) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const identity = useClerkIdentity();
  const [createOpen, setCreateOpen] = useState(false);

  const runtimeQ = useQuery({
    queryKey: ["runtime", game?.id],
    queryFn: () => endpoints.runtime(game!.id),
    enabled: Boolean(API_URL) && open && Boolean(game?.id),
  });

  useEffect(() => {
    if (!open) setCreateOpen(false);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (payload: CreateMatchPayload) =>
      api<Match>("/matches", { method: "POST", body: { ...identity, ...payload } }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["matches", "mine"] });
      setCreateOpen(false);
      onOpenChange(false);
      navigate({ to: "/match/$matchId", params: { matchId: m.matchId } });
    },
  });

  if (!game) return null;

  const runtime = runtimeQ.data;
  const gameTables = myMatches.filter((m) => m.gameId === game.id);
  const runtimeLabel = (players?: number) => {
    const est = estimateRuntime(runtime, players);
    if (!est) return null;
    const label = formatDuration(est.ms);
    if (!label) return null;
    if (est.source === "exact" && est.players) return `${label} · ${est.players} players`;
    if (est.source === "nearest" && est.players) return `${label} · ${est.players}p avg`;
    return `${label} · avg`;
  };

  return (
    <>
      <Dialog open={open && !createOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{game.name}</DialogTitle>
            <DialogDescription>{game.description}</DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {game.minPlayers === game.maxPlayers
                ? `${game.maxPlayers} players`
                : `${game.minPlayers}–${game.maxPlayers} players`}
            </span>
            {runtimeLabel() && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {runtimeLabel()}
              </span>
            )}
            {game.status === "coming-soon" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 uppercase tracking-wider text-amber-500">
                Coming soon
              </span>
            )}
          </div>

          <Tabs defaultValue="play" className="mt-4">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="play">Play</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="rules">How to play</TabsTrigger>
            </TabsList>

            <TabsContent value="play" className="mt-4 space-y-4">
              {game.status !== "available" ? (
                <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  This game is not available yet. Check back soon.
                </p>
              ) : (
                <>
                  {gameTables.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Your tables</h3>
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {gameTables.map((m) => (
                          <li key={m.matchId} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div>
                              <div className="font-medium">
                                {m.status}
                                {m.code && (
                                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
                                    {m.code}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {m.players.length}/{m.maxPlayers} players
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                onOpenChange(false);
                                navigate({ to: "/match/$matchId", params: { matchId: m.matchId } });
                              }}
                            >
                              Rejoin
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button
                      className="h-auto py-4"
                      onClick={() => setCreateOpen(true)}
                      disabled={!API_URL}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-base font-semibold">Create table</span>
                        <span className="text-xs opacity-80">Solo vs AI or public/private</span>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4"
                      onClick={() => {
                        onOpenChange(false);
                        onJoinTable();
                      }}
                      disabled={!API_URL}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-base font-semibold">Join table</span>
                        <span className="text-xs opacity-80">Public list or 6-letter code</span>
                      </div>
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              <Leaderboard games={games} gameId={game.id} />
            </TabsContent>

            <TabsContent value="rules" className="mt-4">
              <div className="space-y-4 text-sm leading-relaxed text-foreground/85">
                <RulesContent gameId={game.id} />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <CreateTableDialog
        game={createOpen ? game : null}
        open={createOpen}
        onOpenChange={(v) => setCreateOpen(v)}
        onSubmit={(payload) => createMut.mutate(payload)}
        pending={createMut.isPending}
        error={createMut.error instanceof Error ? createMut.error.message : null}
      />
    </>
  );
}