import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CreateMatchPayload, Game } from "@/lib/api";

export function CreateTableDialog({
  game,
  open,
  onOpenChange,
  onSubmit,
  pending,
  error,
}: {
  game: Game | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (payload: CreateMatchPayload) => void;
  pending: boolean;
  error?: string | null;
}) {
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");

  if (!game) return null;

  const disabled =
    pending ||
    maxPlayers < game.minPlayers ||
    maxPlayers > game.maxPlayers ||
    (visibility === "private" && password.trim().length < 4);

  const submit = () => {
    onSubmit({
      gameId: game.id,
      maxPlayers,
      visibility,
      password: visibility === "private" ? password.trim() : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {game.name} table</DialogTitle>
          <DialogDescription>Configure your table and invite others.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="max-players">Max players</Label>
            <Input
              id="max-players"
              type="number"
              min={game.minPlayers}
              max={game.maxPlayers}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Between {game.minPlayers} and {game.maxPlayers}.
            </p>
          </div>

          <div>
            <Label>Visibility</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  visibility === "public"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  visibility === "private"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Private
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {visibility === "public"
                ? "Anyone can find and join from the lobby."
                : "Hidden from the lobby. Only players with the ID + password can join."}
            </p>
          </div>

          {visibility === "private" && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="text"
                minLength={4}
                maxLength={64}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="4–64 characters"
                className="mt-1"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Share this password with players you invite.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={disabled}>
            {pending ? "Creating…" : "Create table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}