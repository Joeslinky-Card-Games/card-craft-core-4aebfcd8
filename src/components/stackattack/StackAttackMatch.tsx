import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUser } from "@clerk/tanstack-react-start";
import { motion, AnimatePresence } from "framer-motion";
import { useApi, type MatchView } from "@/lib/api";
import { useClerkIdentity } from "@/lib/identity";
import { StackCard, StackCardBack, EmptyStackSlot, isWildCard, rankOfCard } from "./StackCard";

type Source =
  | { from: "hand"; handIndex: number }
  | { from: "stock" }
  | { from: "discard"; discardPileIndex: number }
  | null;

function displayName(match: MatchView, userId: string, self: string): string {
  if (userId === self) return "You";
  return match.usernames?.[userId] ?? userId.slice(0, 6);
}

export function StackAttackMatch({ matchId }: { matchId: string }) {
  const { user } = useUser();
  const userId = user?.id ?? "";
  const api = useApi();
  const qc = useQueryClient();
  const identity = useClerkIdentity();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => api<MatchView>(`/matches/${matchId}`),
    refetchInterval: 1500,
    enabled: Boolean(matchId),
  });
  const match = query.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["match", matchId] });

  const startMut = useMutation({
    mutationFn: () => api<MatchView>(`/matches/${matchId}/start`, { method: "POST" }),
    onSuccess: () => invalidate(),
  });
  const actionMut = useMutation({
    mutationFn: (action: unknown) =>
      api<MatchView>(`/matches/${matchId}/action`, { method: "POST", body: action }),
    onSuccess: () => invalidate(),
  });
  const playAgainMut = useMutation({
    mutationFn: () => api<MatchView>(`/matches/${matchId}/play-again`, { method: "POST" }),
    onSuccess: (data) => {
      if (data && data.matchId !== matchId) {
        qc.removeQueries({ queryKey: ["match", matchId] });
        navigate({ to: "/match/$matchId", params: { matchId: data.matchId } });
      } else invalidate();
    },
  });

  const [source, setSource] = useState<Source>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-run AI turns.
  const currentTurn = match?._order?.[(match?.turn ?? 0) % (match?._order?.length || 1)];
  const aiSet = new Set(match?.aiPlayers ?? []);
  const shouldStepAI =
    match?.status === "in-progress" && currentTurn && aiSet.has(currentTurn);
  if (shouldStepAI) {
    setTimeout(() => {
      api<MatchView>(`/matches/${matchId}/ai-step`, { method: "POST" })
        .then(() => invalidate())
        .catch(() => {});
    }, 550);
  }

  if (!match) {
    return <div className="p-8 text-white/70">Loading match…</div>;
  }

  // -------- Lobby --------
  if (match.status === "open") {
    const canStart = match.players.length >= (match.minPlayers ?? 2);
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          <h1 className="text-3xl font-black">Stack Attack</h1>
          <p className="text-white/60">
            Table code <span className="font-mono text-white">{match.code ?? "—"}</span>
          </p>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
            <div className="text-sm text-white/60">Players ({match.players.length})</div>
            {match.players.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{displayName(match, p, userId)}</span>
                {aiSet.has(p) && <span className="text-xs text-fuchsia-300">(bot)</span>}
              </div>
            ))}
          </div>
          {match.createdBy === userId && (
            <button
              className="px-5 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-40 font-semibold"
              disabled={!canStart || startMut.isPending}
              onClick={() => startMut.mutate()}
            >
              {startMut.isPending ? "Starting…" : "Start match"}
            </button>
          )}
          {identity && null /* keep hook usage stable */}
        </div>
      </div>
    );
  }

  // -------- In-play or complete --------
  const order = match._order ?? match.players;
  const myTurn = currentTurn === userId && match.status === "in-progress";
  const hand: string[] = match.hands?.[userId] ?? [];
  const myDiscards = match.discards?.[userId] ?? [[], [], [], []];
  const buildPiles = match.buildPiles ?? [[], [], [], []];

  const otherPlayers = order.filter((p) => p !== userId);

  const doPlay = (buildPileIndex: number) => {
    if (!source || !myTurn) return;
    setError(null);
    const action = { type: "play", buildPileIndex, ...source };
    actionMut.mutate(action, {
      onError: (e: unknown) => setError((e as Error).message ?? "Play failed"),
      onSuccess: () => setSource(null),
    });
  };
  const doDiscard = (discardPileIndex: number) => {
    if (!source || source.from !== "hand" || !myTurn) return;
    setError(null);
    actionMut.mutate(
      { type: "discard", handIndex: source.handIndex, discardPileIndex },
      {
        onError: (e: unknown) => setError((e as Error).message ?? "Discard failed"),
        onSuccess: () => setSource(null),
      },
    );
  };

  const sourceCard: string | null = (() => {
    if (!source) return null;
    if (source.from === "hand") return hand[source.handIndex] ?? null;
    if (source.from === "stock") return match.stockTops?.[userId] ?? null;
    if (source.from === "discard") {
      const p = myDiscards[source.discardPileIndex];
      return p.length ? p[p.length - 1] : null;
    }
    return null;
  })();

  const isPlayable = (card: string | null, pile: { asRank: number }[]) => {
    if (!card) return false;
    const target = pile.length + 1;
    if (isWildCard(card)) return target <= 12;
    return rankOfCard(card) === target;
  };

  return (
    <div
      className="min-h-[100dvh] text-white flex flex-col"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -100px, rgba(217,70,239,0.25), transparent 60%), radial-gradient(800px 400px at 50% 40%, rgba(56,189,248,0.15), transparent 60%), linear-gradient(180deg, #0a0a1a 0%, #05050e 100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 text-sm border-b border-white/10 bg-black/30">
        <div>
          <span className="font-black text-fuchsia-300">Stack Attack</span>
          <span className="text-white/40 ml-3">Code {match.code}</span>
        </div>
        <div className="text-white/60">
          {match.status === "in-progress" &&
            (myTurn ? (
              <span className="text-emerald-300 font-semibold">Your turn</span>
            ) : (
              <span>{displayName(match, currentTurn ?? "", userId)}'s turn</span>
            ))}
          {match.status === "complete" && (
            <span className="text-amber-300 font-semibold">
              {match.winner === userId ? "You won!" : `${displayName(match, match.winner ?? "", userId)} won`}
            </span>
          )}
        </div>
      </div>

      {/* Opponents strip */}
      <div className="flex gap-3 overflow-x-auto px-4 py-3 border-b border-white/5">
        {otherPlayers.map((p) => {
          const stockTop = match.stockTops?.[p] ?? null;
          const stockCount = match.stockCounts?.[p] ?? 0;
          const handCount = match.handCounts?.[p] ?? 0;
          const isTurn = p === currentTurn;
          const oppDiscards = match.discards?.[p] ?? [[], [], [], []];
          return (
            <div
              key={p}
              className={`rounded-2xl px-3 py-2 border ${
                isTurn ? "border-emerald-400/60 bg-emerald-400/10" : "border-white/10 bg-white/5"
              } shrink-0`}
            >
              <div className="flex items-center gap-2 text-sm mb-2">
                <span className="font-semibold">{displayName(match, p, userId)}</span>
                {aiSet.has(p) && <span className="text-xs text-fuchsia-300">bot</span>}
                <span className="text-xs text-white/50">· {handCount} in hand</span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col items-center">
                  {stockTop ? (
                    <StackCard card={stockTop} size="sm" />
                  ) : (
                    <EmptyStackSlot size="sm" label="—" />
                  )}
                  <span className="text-[10px] text-white/60 mt-1">Stock {stockCount}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {oppDiscards.map((pile, i) => {
                    const top = pile[pile.length - 1];
                    return top ? (
                      <div key={i} className="relative">
                        <StackCard card={top} size="xs" />
                        {pile.length > 1 && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-black/70 rounded-full px-1">
                            {pile.length}
                          </span>
                        )}
                      </div>
                    ) : (
                      <EmptyStackSlot key={i} size="xs" />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Build piles */}
      <div className="flex-1 flex items-center justify-center py-6">
        <div className="flex gap-4 sm:gap-6">
          {buildPiles.map((pile, i) => {
            const top = pile[pile.length - 1];
            const target = pile.length + 1;
            const playable = source && myTurn && isPlayable(sourceCard, pile);
            return (
              <button
                key={i}
                onClick={() => (playable ? doPlay(i) : undefined)}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2 transition
                  ${playable ? "bg-emerald-400/20 ring-2 ring-emerald-300" : "bg-white/5 ring-1 ring-white/10"}
                `}
              >
                {top ? (
                  <StackCard card={top.card} displayRank={top.asRank} size="md" />
                ) : (
                  <EmptyStackSlot size="md" label="1" />
                )}
                <span className="text-[10px] uppercase tracking-wider text-white/60">
                  {pile.length === 12 ? "Complete" : `Next ${target}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* My area */}
      <div className="border-t border-white/10 bg-black/40 pt-3 pb-4 px-3">
        <div className="flex justify-between items-end gap-3 mb-3">
          {/* Stock */}
          <div className="flex flex-col items-center">
            <button
              disabled={!myTurn || !match.stockTops?.[userId]}
              onClick={() =>
                setSource(source?.from === "stock" ? null : { from: "stock" })
              }
              className={`rounded-xl p-1 ${
                source?.from === "stock" ? "ring-2 ring-white" : ""
              }`}
            >
              {match.stockTops?.[userId] ? (
                <StackCard card={match.stockTops[userId]!} size="md" />
              ) : (
                <EmptyStackSlot size="md" label="—" />
              )}
            </button>
            <span className="text-[11px] text-white/70 mt-1">
              Stock {match.stockCounts?.[userId] ?? 0}
            </span>
          </div>

          {/* Discard piles */}
          <div className="flex gap-2">
            {myDiscards.map((pile, i) => {
              const top = pile[pile.length - 1];
              const canDiscardHere =
                source?.from === "hand" && myTurn;
              const isSourceHere =
                source?.from === "discard" && source.discardPileIndex === i;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (canDiscardHere) return doDiscard(i);
                    if (top && myTurn) {
                      setSource(
                        isSourceHere ? null : { from: "discard", discardPileIndex: i },
                      );
                    }
                  }}
                  className={`relative rounded-xl p-1
                    ${canDiscardHere ? "ring-2 ring-amber-300 bg-amber-300/10" : ""}
                    ${isSourceHere ? "ring-2 ring-white" : ""}
                  `}
                >
                  {top ? (
                    <StackCard card={top} size="sm" />
                  ) : (
                    <EmptyStackSlot size="sm" label={`D${i + 1}`} />
                  )}
                  {pile.length > 1 && (
                    <span className="absolute -top-1 -right-1 text-[10px] bg-black/70 rounded-full px-1">
                      {pile.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hand */}
        <div className="flex justify-center gap-2 flex-wrap">
          <AnimatePresence>
            {hand.map((card, i) => {
              const selected =
                source?.from === "hand" && source.handIndex === i;
              return (
                <motion.div
                  key={`${card}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <StackCard
                    card={card}
                    size="md"
                    selected={selected}
                    onClick={() =>
                      myTurn
                        ? setSource(selected ? null : { from: "hand", handIndex: i })
                        : undefined
                    }
                  />
                </motion.div>
              );
            })}
            {hand.length === 0 && (
              <div className="text-white/50 text-sm py-6">
                Hand refills at the start of your turn.
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 text-center text-xs text-white/60">
          {myTurn ? (
            source ? (
              source.from === "hand" ? (
                <>Tap a build pile to play, or a discard pile to end your turn.</>
              ) : (
                <>Tap a build pile to play.</>
              )
            ) : (
              <>Tap a card to select. Empty your stock to win.</>
            )
          ) : (
            <>Waiting for {displayName(match, currentTurn ?? "", userId)}…</>
          )}
        </div>
        {error && (
          <div className="mt-2 text-center text-xs text-rose-300">{error}</div>
        )}

        {match.status === "complete" && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => playAgainMut.mutate()}
              className="px-5 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 font-semibold"
            >
              {(match.playAgain ?? []).includes(userId)
                ? `Waiting… (${(match.playAgain ?? []).length}/${match.players.length})`
                : "Play again"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default StackAttackMatch;