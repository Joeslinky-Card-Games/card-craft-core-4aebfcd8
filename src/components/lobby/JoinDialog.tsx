import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { API_URL, endpoints, useApi, type Game, type MatchView } from "@/lib/api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function JoinDialog({
  open,
  onOpenChange,
  games,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  games: Game[];
  userId: string;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tableId, setTableId] = useState("");
  const [password, setPassword] = useState("");

  const matchesQuery = useQuery({
    queryKey: ["matches", "open"],
    queryFn: () => endpoints.listMatches(),
    enabled: Boolean(API_URL) && open,
    refetchInterval: open ? 5000 : false,
  });

  const joinMut = useMutation({
    mutationFn: (input: { matchId: string; password?: string }) =>
      api<MatchView>(`/matches/${input.matchId}/join`, {
        method: "POST",
        body: input.password ? { password: input.password } : {},
      }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["matches", "open"] });
      qc.invalidateQueries({ queryKey: ["matches", "mine"] });
      onOpenChange(false);
      navigate({ to: "/match/$matchId", params: { matchId: m.matchId } });
    },
  });

  const openMatches = matchesQuery.data?.matches ?? [];
  const trimmedId = tableId.trim();
  const idValid = UUID_RE.test(trimmedId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Join a table</DialogTitle>
          <DialogDescription>Browse open tables or enter a private table's ID and password.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse">Browse open tables</TabsTrigger>
            <TabsTrigger value="private">Join by ID</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-3">
            {openMatches.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No open public tables right now.
              </p>
            ) : (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {openMatches.map((m) => {
                  const gameName = games.find((g) => g.id === m.gameId)?.name ?? m.gameId;
                  const already = m.players.includes(userId);
                  const full = m.players.length >= m.maxPlayers;
                  return (
                    <li key={m.matchId} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium">{gameName}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.players.length}/{m.maxPlayers} players · {new Date(m.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={joinMut.isPending || (full && !already)}
                        onClick={() =>
                          already
                            ? (onOpenChange(false), navigate({ to: "/match/$matchId", params: { matchId: m.matchId } }))
                            : joinMut.mutate({ matchId: m.matchId })
                        }
                      >
                        {already ? "Enter" : full ? "Full" : "Join"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="private" className="mt-3 space-y-4">
            <div>
              <Label htmlFor="table-id">Table ID</Label>
              <Input
                id="table-id"
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 font-mono text-xs"
                autoComplete="off"
              />
              {tableId && !idValid && (
                <p className="mt-1 text-xs text-destructive">Not a valid table ID.</p>
              )}
            </div>
            <div>
              <Label htmlFor="join-password">Password</Label>
              <Input
                id="join-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Required for private tables"
                className="mt-1"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank if the table is public.
              </p>
            </div>
            {joinMut.error instanceof Error && (
              <p className="text-sm text-destructive">{joinMut.error.message}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                disabled={!idValid || joinMut.isPending}
                onClick={() =>
                  joinMut.mutate({
                    matchId: trimmedId,
                    password: password.trim() || undefined,
                  })
                }
              >
                {joinMut.isPending ? "Joining…" : "Join table"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>

        {joinMut.error instanceof Error && (
          <p className="mt-2 text-sm text-destructive">{joinMut.error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}