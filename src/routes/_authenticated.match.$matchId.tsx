import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useUser } from "@clerk/tanstack-react-start";
import { useApi, type GameAction, type MatchView, type ChatMessage } from "@/lib/api";
import { useClerkIdentity } from "@/lib/identity";
import { PlayingCard, CardBack, EmptyCardSlot } from "@/components/game/PlayingCard";
import { sortHand, cardPoints } from "@/lib/game/cards";
import { autoArrange, orderMeldForDisplay } from "@/lib/game/melds";
import { RulesDialog } from "@/components/game/RulesDialog";

export const Route = createFileRoute("/_authenticated/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Match — Card Table" },
      { name: "description", content: "Live Charlotte's Web match." },
    ],
  }),
  component: MatchPage,
});

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 4) + "…" + id.slice(-4);
}

function displayName(match: MatchView, userId: string, self: string): string {
  if (userId === self) return "You";
  return match.usernames?.[userId] ?? shortId(userId);
}

function avatarOf(match: MatchView, userId: string, selfId: string, selfImage: string | null): string | null {
  if (userId === selfId && selfImage) return selfImage;
  return match.avatars?.[userId] ?? null;
}

function initialsOf(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function MatchPage() {
  const { matchId } = Route.useParams();
  const { user } = useUser();
  const userId = user?.id ?? "";
  const selfImage = user?.imageUrl ?? null;
  const api = useApi();
  const qc = useQueryClient();
  const identity = useClerkIdentity();

  const query = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => api<MatchView>(`/matches/${matchId}`),
    refetchInterval: 2000,
    enabled: Boolean(matchId),
  });

  // Clerk session JWTs don't carry username/avatar. Refresh the caller's own
  // entry once the client identity is loaded so other players see the right
  // name (fixes stale creator names on tables created before identity was
  // available client-side).
  const storedName = query.data?.usernames?.[userId] ?? null;
  const storedAvatar = query.data?.avatars?.[userId] ?? null;
  const isPlayer = Boolean(userId) && Array.isArray(query.data?.players) && query.data!.players.includes(userId);
  const needsRefresh =
    isPlayer &&
    ((identity.displayName && identity.displayName !== storedName) ||
      (identity.avatarUrl && identity.avatarUrl !== storedAvatar));
  useEffect(() => {
    if (!needsRefresh) return;
    let cancelled = false;
    api<MatchView>(`/matches/${matchId}/identify`, {
      method: "POST",
      body: { displayName: identity.displayName, avatarUrl: identity.avatarUrl },
    })
      .then((data) => { if (!cancelled) qc.setQueryData(["match", matchId], data); })
      .catch(() => { /* non-fatal — next call retries */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRefresh, matchId, identity.displayName, identity.avatarUrl]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["match", matchId] });

  const startMut = useMutation({
    mutationFn: () => api<MatchView>(`/matches/${matchId}/start`, { method: "POST" }),
    onSuccess: (data) => { qc.setQueryData(["match", matchId], data); },
  });
  const actionMut = useMutation({
    mutationFn: (action: GameAction) =>
      api<MatchView>(`/matches/${matchId}/action`, { method: "POST", body: action }),
    onSuccess: (data) => { qc.setQueryData(["match", matchId], data); },
  });
  const nextRoundMut = useMutation({
    mutationFn: () => api<MatchView>(`/matches/${matchId}/next-round`, { method: "POST" }),
    onSuccess: (data) => { qc.setQueryData(["match", matchId], data); },
  });
  const chatMut = useMutation({
    mutationFn: (text: string) =>
      api<MatchView>(`/matches/${matchId}/chat`, { method: "POST", body: { text } }),
    onSuccess: (data) => { qc.setQueryData(["match", matchId], data); },
  });
  const chatError = chatMut.error instanceof Error ? chatMut.error.message : null;
  const sendChat = (text: string) => chatMut.mutate(text);

  if (query.isLoading) return <Centered>Loading match…</Centered>;
  if (query.error) return <Centered>Failed to load match. <button className="underline" onClick={invalidate}>Retry</button></Centered>;
  const match = query.data!;

  if (match.status === "open") {
    return (
      <LobbyView
        match={match}
        userId={userId}
        selfImage={selfImage}
        onStart={() => startMut.mutate()}
        starting={startMut.isPending}
        startError={startMut.error instanceof Error ? startMut.error.message : null}
        onSendChat={sendChat}
        chatPending={chatMut.isPending}
        chatError={chatError}
      />
    );
  }

  return (
    <GameView
      match={match}
      userId={userId}
      selfImage={selfImage}
      onAction={(a) => actionMut.mutate(a)}
      onNextRound={() => nextRoundMut.mutate()}
      pending={actionMut.isPending || nextRoundMut.isPending}
      actionError={actionMut.error instanceof Error ? actionMut.error.message : null}
      onSendChat={sendChat}
      chatPending={chatMut.isPending}
      chatError={chatError}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">{children}</div>;
}

function LobbyView({
  match,
  userId,
  selfImage,
  onStart,
  starting,
  startError,
  onSendChat,
  chatPending,
  chatError,
}: {
  match: MatchView;
  userId: string;
  selfImage: string | null;
  onStart: () => void;
  starting: boolean;
  startError: string | null;
  onSendChat: (text: string) => void;
  chatPending: boolean;
  chatError: string | null;
}) {
  const isCreator = match.createdBy === userId;
  const minPlayers = match.minPlayers ?? 2;
  const canStart = isCreator && match.players.length >= minPlayers;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-4 text-sm text-white/70">
        <Link to="/lobby" className="underline hover:text-white">← Lobby</Link>
      </div>
      <h1 className="font-serif text-4xl font-bold tracking-tight text-amber-100">Charlotte's Web</h1>
      <p className="mt-1 text-sm text-white/60">Waiting for players.</p>
      {match.code && (
        <div className="mt-4 inline-flex flex-col items-start rounded-lg border border-amber-500/40 bg-black/30 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/70">
            Table code — share to invite
          </span>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(match.code!); }}
            className="mt-1 font-mono text-2xl tracking-[0.4em] text-amber-100 hover:text-white"
            title="Click to copy"
          >
            {match.code}
          </button>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-amber-900/40 bg-emerald-950/40 p-6 shadow-xl backdrop-blur">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-200/70">
          Players ({match.players.length}/{match.maxPlayers})
        </h2>
        <ul className="mt-3 space-y-2">
          {match.players.map((p) => {
            const name = displayName(match, p, userId);
            const img = avatarOf(match, p, userId, selfImage);
            return (
              <li key={p} className="flex items-center justify-between rounded-md bg-black/30 px-3 py-2 text-sm text-white">
                <div className="flex items-center gap-2">
                  <Avatar name={name} userId={p} imageUrl={img} size="sm" />
                  <span>{name}</span>
                </div>
                {p === match.createdBy && <span className="text-xs text-amber-200/70">host</span>}
              </li>
            );
          })}
        </ul>
        {isCreator ? (
          <button
            disabled={!canStart || starting}
            onClick={onStart}
            className="mt-6 w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow hover:bg-amber-400 disabled:opacity-50"
          >
            {starting ? "Starting…" : canStart ? "Start match" : `Need ${minPlayers}+ players`}
          </button>
        ) : (
          <p className="mt-6 text-sm text-white/60">Waiting for the host to start.</p>
        )}
        {startError && <p className="mt-2 text-sm text-rose-300">{startError}</p>}
      </div>
      <ChatPanel
        match={match}
        userId={userId}
        onSend={onSendChat}
        pending={chatPending}
        error={chatError}
      />
    </main>
  );
}

// -------- Game view --------

function GameView({
  match,
  userId,
  selfImage,
  onAction,
  onNextRound,
  pending,
  actionError,
  onSendChat,
  chatPending,
  chatError,
}: {
  match: MatchView;
  userId: string;
  selfImage: string | null;
  onAction: (a: GameAction) => void;
  onNextRound: () => void;
  pending: boolean;
  actionError: string | null;
  onSendChat: (text: string) => void;
  chatPending: boolean;
  chatError: string | null;
}) {
  const order = match._order ?? match.players;
  const currentUser = order[(match.turn ?? 0) % order.length];
  const isMyTurn = currentUser === userId;
  const myHand = match.hands?.[userId] ?? [];
  const sorted = useMemo(() => sortHand(myHand, match.wildRank), [myHand, match.wildRank]);
  const wildRank = match.wildRank ?? null;

  // Rules dialog: auto-open on first game entry, respect "don't show again".
  const RULES_KEY = "cw:rules-dismissed";
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(RULES_KEY) === "1";
    if (!dismissed) setRulesOpen(true);
  }, []);
  const dontShowAgain = () => {
    try { window.localStorage.setItem(RULES_KEY, "1"); } catch { /* ignore */ }
    setRulesOpen(false);
  };

  const opponents = order.filter((p) => p !== userId);
  const goneOut = match.goneOutBy;
  const roundComplete = match.status === "round-complete";
  const matchComplete = match.status === "complete";

  const discardTop = match.discard && match.discard.length > 0 ? match.discard[match.discard.length - 1] : null;

  // Automatic meld arrangement — recomputes any time the hand changes.
  const arrangement = useMemo(
    () => autoArrange(myHand, wildRank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myHand.join("|"), wildRank],
  );
  const meldedIds = useMemo(() => new Set(arrangement.melds.flat()), [arrangement]);
  const unmelded = useMemo(() => sorted.filter((c) => !meldedIds.has(c)), [sorted, meldedIds]);
  const unmeldedScore = unmelded.reduce((s, c) => s + cardPoints(c), 0);
  const canLayDown = arrangement.complete && arrangement.discard !== null && isMyTurn && Boolean(match.hasDrawn) && !roundComplete && !matchComplete;
  const canDiscard = isMyTurn && Boolean(match.hasDrawn) && !roundComplete && !matchComplete;

  const goOutOptions = arrangement.goOutOptions ?? [];
  const [pickingGoOutDiscard, setPickingGoOutDiscard] = useState(false);

  // Reset the picker if the state that gates it changes.
  useEffect(() => {
    if (!canLayDown || goOutOptions.length <= 1) setPickingGoOutDiscard(false);
  }, [canLayDown, goOutOptions.length]);

  const handleCardClick = (card: string) => {
    if (pickingGoOutDiscard) return; // picker modal handles selection
    if (!canDiscard) return;
    onAction({ type: "discard", card });
  };

  const handlePickOption = (opt: { discard: string; melds: string[][] }) => {
    setPickingGoOutDiscard(false);
    onAction({ type: "lay-down", melds: opt.melds, discard: opt.discard });
  };

  const handleLayDown = () => {
    if (!arrangement.complete || !arrangement.goOutMelds || !arrangement.goOutDiscard) return;
    if (goOutOptions.length > 1) {
      setPickingGoOutDiscard(true);
      return;
    }
    onAction({
      type: "lay-down",
      melds: arrangement.goOutMelds,
      discard: arrangement.goOutDiscard,
    });
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden">
      {/* Felt table backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, #0f6a48 0%, #0a4a32 45%, #062a1c 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 mix-blend-overlay [background:repeating-linear-gradient(45deg,transparent_0_3px,rgba(255,255,255,0.04)_3px_6px)]" />

      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link to="/lobby" className="text-white/70 underline hover:text-white">← Lobby</Link>
          <div className="flex items-center gap-4 rounded-full border border-amber-300/30 bg-black/25 px-4 py-1.5 text-white/80 shadow backdrop-blur">
            <span>Round <b className="text-amber-200">{match.round}/13</b></span>
            <span className="text-white/30">·</span>
            <span>Hand <b className="text-amber-200">{match.handSize}</b></span>
            <span className="text-white/30">·</span>
            <span>Wild <b className="text-amber-300">{wildRank === null ? "—" : wildRank === "T" ? "10" : wildRank}</b> + ★</span>
            <span className="text-white/30">·</span>
            <span>Score <b className="text-amber-200">{match.scores?.[userId] ?? 0}</b></span>
            <span className="text-white/30">·</span>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="rounded-full px-1 text-amber-200 hover:text-amber-100"
            >
              Rules
            </button>
          </div>
        </div>

        {/* Table area with seats */}
        <TableArea
          opponents={opponents}
          match={match}
          userId={userId}
          selfImage={selfImage}
          currentUser={currentUser}
          isMyTurn={isMyTurn}
          pending={pending}
          goneOut={goneOut}
          roundComplete={roundComplete}
          discardTop={discardTop}
          wildRank={wildRank}
          onAction={onAction}
        />

        <div className="mt-4 text-center text-sm">
        {matchComplete ? (
          <span className="text-emerald-300">
            Match complete. Winner: <b className="text-amber-200">{displayName(match, match.winner ?? "", userId)}</b>
          </span>
        ) : roundComplete ? (
          <span className="text-white/70">Round {match.round} complete.</span>
        ) : goneOut ? (
          <span className="text-amber-300">
            {goneOut === userId ? "You went out." : `${displayName(match, goneOut, userId)} went out.`}
            {" "}Final turns remaining: {match.remainingFinalTurns}.
          </span>
        ) : isMyTurn ? (
          <span className="text-amber-200">Your turn — {
            !match.hasDrawn
              ? "draw a card"
              : canLayDown
                ? "tap a card to discard, or lay down to go out"
                : "tap a card to discard"
          }.</span>
        ) : (
          <span className="text-white/70">Waiting on {displayName(match, currentUser, userId)}…</span>
        )}
          {actionError && <div className="mt-1 text-xs text-rose-300">{actionError}</div>}
        </div>

      {/* My hand */}
      <section
        className={`mt-6 rounded-2xl p-3 transition-all duration-300 ${
          isMyTurn && !roundComplete && !matchComplete
            ? "bg-amber-400/10 shadow-[0_0_28px_rgba(251,191,36,0.55)] ring-2 ring-amber-300"
            : "ring-1 ring-transparent"
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-200/70">
            Your hand — {sorted.length} card{sorted.length === 1 ? "" : "s"} · unmelded {" "}
            <b className="text-amber-100">{unmeldedScore}</b>
          </h2>
          {canLayDown && (
            <button
              onClick={handleLayDown}
              disabled={pending}
              className="rounded-md bg-amber-400 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-950 shadow-[0_0_16px_rgba(251,191,36,0.6)] hover:bg-amber-300 disabled:opacity-40"
            >
              Lay down · go out
            </button>
          )}
        </div>

        <LayoutGroup>
          {/* Single hand row: melds (condensed/overlapping) + unmelded cards */}
          <div className="rounded-xl border border-white/10 bg-black/25 p-3 backdrop-blur">
            <div className="flex min-h-[7rem] flex-wrap items-end justify-center gap-x-6 gap-y-3">
              <AnimatePresence initial={false}>
                {arrangement.melds.map((rawMeld, mi) => {
                  const meld = orderMeldForDisplay(rawMeld, wildRank);
                  return (
                  <motion.div
                    key={`meld-${meld.join(",")}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 240, damping: 22 }}
                    className="relative flex items-end rounded-lg bg-emerald-900/50 px-2 py-1 ring-1 ring-amber-300/40"
                    title={`Meld #${mi + 1}`}
                  >
                    {meld.map((c, i) => (
                      <motion.div
                        key={c}
                        layoutId={`card-${c}`}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        style={{ marginLeft: i === 0 ? 0 : -34, zIndex: i }}
                      >
                        <PlayingCard
                          id={c}
                          wildRank={wildRank}
                          onClick={() => handleCardClick(c)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                  );
                })}
                {unmelded.map((c) => (
                  <motion.div
                    key={c}
                    layoutId={`card-${c}`}
                    initial={{ y: -140, opacity: 0, rotate: -8 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: 120, opacity: 0, rotate: 6, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  >
                    <PlayingCard
                      id={c}
                      wildRank={wildRank}
                      onClick={() => handleCardClick(c)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {sorted.length === 0 && <p className="self-center text-sm text-white/60">No cards in hand.</p>}
              {sorted.length > 0 && unmelded.length === 0 && arrangement.melds.length > 0 && (
                canLayDown ? (
                  <p className="self-center text-sm text-amber-200/80">All cards melded — lay down to go out.</p>
                ) : canDiscard ? (
                  <p className="self-center text-sm text-amber-200/80">
                    All cards fit into melds — tap a card to discard (a meld will be broken).
                  </p>
                ) : (
                  <p className="self-center text-sm text-amber-200/80">All cards fit into melds.</p>
                )
              )}
            </div>
          </div>
        </LayoutGroup>
      </section>
      </div>

      {/* Round complete modal */}
      {(roundComplete || matchComplete) && (
        <RoundSummary
          match={match}
          userId={userId}
          onNext={onNextRound}
          pending={pending}
        />
      )}

      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        onDontShowAgain={dontShowAgain}
      />
      {pickingGoOutDiscard && (
        <GoOutOptionsPicker
          options={goOutOptions}
          wildRank={wildRank}
          pending={pending}
          onCancel={() => setPickingGoOutDiscard(false)}
          onPick={handlePickOption}
        />
      )}
      <ChatPanel
        match={match}
        userId={userId}
        onSend={onSendChat}
        pending={chatPending}
        error={chatError}
      />
    </main>
  );
}

function TableArea({
  opponents,
  match,
  userId,
  selfImage,
  currentUser,
  isMyTurn,
  pending,
  goneOut,
  roundComplete,
  discardTop,
  wildRank,
  onAction,
}: {
  opponents: string[];
  match: MatchView;
  userId: string;
  selfImage: string | null;
  currentUser: string;
  isMyTurn: boolean;
  pending: boolean;
  goneOut: string | null | undefined;
  roundComplete: boolean;
  discardTop: string | null;
  wildRank: string | null;
  onAction: (a: GameAction) => void;
}) {
  // Position opponents evenly around the upper half of an ellipse.
  const n = opponents.length;
  const seats = opponents.map((p, i) => {
    // angles from ~200° to ~-20° (i.e. bottom-left, top, bottom-right) staying on upper arc
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angleDeg = 200 - t * 220; // 200..-20
    const rad = (angleDeg * Math.PI) / 180;
    // Container: 0.5 + rx*cos, 0.5 - ry*sin (y inverted; sin>0 -> top)
    const rx = 0.42;
    const ry = 0.38;
    const x = 0.5 + rx * Math.cos(rad);
    const y = 0.5 - ry * Math.sin(rad);
    return { p, x, y };
  });

  return (
    <div className="relative mx-auto aspect-[16/9] w-full max-w-4xl">
      {/* Oval table */}
      <div
        className="absolute inset-4 rounded-[50%] border-[10px] border-amber-950/80 shadow-[inset_0_0_60px_rgba(0,0,0,0.55),0_20px_50px_rgba(0,0,0,0.5)]"
        style={{
          background:
            "radial-gradient(ellipse at center, #147a56 0%, #0c5c40 55%, #084b34 100%)",
        }}
      />
      {/* Table stitching */}
      <div className="pointer-events-none absolute inset-8 rounded-[50%] border border-dashed border-amber-200/15" />

      {/* Seats */}
      {seats.map(({ p, x, y }) => {
        const name = displayName(match, p, userId);
        const img = avatarOf(match, p, userId, selfImage);
        return (
          <div
            key={p}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            <SeatCard
              name={name}
              userId={p}
              imageUrl={img}
              isTurn={p === currentUser}
              count={match.handCounts?.[p] ?? 0}
              score={match.scores?.[p] ?? 0}
              wentOut={Boolean(match.laidMelds?.[p])}
              laidMelds={match.laidMelds?.[p]}
              wildRank={wildRank}
            />
          </div>
        );
      })}

      {/* Center piles */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-6">
        {(() => {
          const canDrawStock = isMyTurn && !match.hasDrawn && !pending && !roundComplete;
          const canDrawDiscard = canDrawStock && Boolean(discardTop);
          return (
            <>
              <motion.button
                type="button"
                disabled={!canDrawStock}
                onClick={() => onAction({ type: "draw-stock" })}
                title={canDrawStock ? "Draw from stock" : "Stock"}
                whileHover={canDrawStock ? { y: -8, scale: 1.04 } : undefined}
                whileTap={canDrawStock ? { scale: 0.97 } : undefined}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className={`relative rounded-lg ${canDrawStock ? "cursor-pointer shadow-[0_0_18px_rgba(251,191,36,0.35)] ring-2 ring-amber-300/70" : "cursor-default"} disabled:opacity-80`}
              >
                <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-black/30 blur-[2px]" />
                <CardBack size="lg" count={match.stockCount} />
              </motion.button>
              <motion.button
                type="button"
                disabled={!canDrawDiscard}
                onClick={() => onAction({ type: "draw-discard" })}
                title={canDrawDiscard ? "Take discard" : "Discard pile"}
                whileHover={canDrawDiscard ? { y: -8, scale: 1.04 } : undefined}
                whileTap={canDrawDiscard ? { scale: 0.97 } : undefined}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className={`relative h-32 w-24 rounded-lg ${canDrawDiscard ? "cursor-pointer shadow-[0_0_18px_rgba(251,191,36,0.35)] ring-2 ring-amber-300/70" : "cursor-default"} disabled:opacity-80`}
              >
                <AnimatePresence mode="popLayout">
                  {discardTop ? (
                    <motion.div
                      key={discardTop + ":" + (match.discard?.length ?? 0)}
                      initial={{ y: -80, x: -20, rotate: -12, opacity: 0 }}
                      animate={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 280, damping: 22 }}
                      className="absolute inset-0"
                    >
                      <PlayingCard id={discardTop} wildRank={wildRank} size="lg" />
                    </motion.div>
                  ) : (
                    <EmptyCardSlot size="lg" label="discard" />
                  )}
                </AnimatePresence>
              </motion.button>
            </>
          );
        })()}
      </div>
    </div>
  );
}

function Avatar({ name, userId, imageUrl, size = "md" }: { name: string; userId: string; imageUrl?: string | null; size?: "sm" | "md" }) {
  const hue = avatarHue(userId);
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-sm";
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${dim} rounded-full object-cover shadow-inner ring-2 ring-black/30`}
      />
    );
  }
  return (
    <div
      className={`flex ${dim} items-center justify-center rounded-full font-bold text-white shadow-inner ring-2 ring-black/30`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 40) % 360} 65% 30%))` }}
    >
      {initialsOf(name)}
    </div>
  );
}

function SeatCard({
  name,
  userId,
  imageUrl,
  isTurn,
  count,
  score,
  wentOut,
  laidMelds,
  wildRank,
}: {
  name: string;
  userId: string;
  imageUrl: string | null;
  isTurn: boolean;
  count: number;
  score: number;
  wentOut: boolean;
  laidMelds?: string[][];
  wildRank: string | null;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 backdrop-blur transition-all ${
        isTurn
          ? "bg-amber-400/15 shadow-[0_0_24px_rgba(251,191,36,0.5)] ring-2 ring-amber-300"
          : "bg-black/40 ring-1 ring-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar name={name} userId={userId} imageUrl={imageUrl} />
        <div className="text-left leading-tight">
          <div className="max-w-[8rem] truncate text-sm font-semibold text-white">{name}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">
            total <span className="text-amber-200">{score}</span>
          </div>
        </div>
      </div>
      {laidMelds && laidMelds.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {laidMelds.map((meld, i) => (
            <div key={i} className="flex -space-x-3">
              {orderMeldForDisplay(meld, wildRank).map((c) => (
                <PlayingCard key={c} id={c} wildRank={wildRank} size="sm" />
              ))}
            </div>
          ))}
        </div>
      ) : (
      <div className="relative mt-1 flex h-8 items-center justify-center">
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => {
          const total = Math.min(count, 6);
          const offset = (i - (total - 1) / 2) * 6;
          const rot = (i - (total - 1) / 2) * 6;
          return (
            <div
              key={i}
              className="absolute h-9 w-6 rounded-sm border border-emerald-950/60 shadow-sm"
              style={{
                background:
                  "repeating-linear-gradient(45deg, #7f1d1d 0 3px, #991b1b 3px 6px)",
                transform: `translateX(${offset}px) rotate(${rot}deg)`,
                zIndex: i,
              }}
            />
          );
        })}
        {count > 6 && (
          <span className="absolute -bottom-3 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
            {count}
          </span>
        )}
        {count === 0 && wentOut && (
          <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
            went out
          </span>
        )}
      </div>
      )}
    </div>
  );
}

function RoundSummary({
  match,
  userId,
  onNext,
  pending,
}: {
  match: MatchView;
  userId: string;
  onNext: () => void;
  pending: boolean;
}) {
  const navigate = useNavigate();
  const deltas = match.lastRoundScores ?? {};
  const scores = match.scores ?? {};
  const complete = match.status === "complete";
  const sorted = [...match.players].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 250, damping: 20 }}
        className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 to-emerald-900 p-6 text-white shadow-2xl"
      >
        <h2 className="font-serif text-2xl font-bold text-amber-100">
          {complete ? "Match complete" : `Round ${match.round} complete`}
        </h2>
        <p className="mt-1 text-xs text-white/60">
          {complete
            ? `Winner: ${displayName(match, match.winner ?? "", userId)}`
            : `Lowest total after 13 rounds wins.`}
        </p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-amber-200/70">
              <th className="py-1">Player</th>
              <th>+ Round</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p} className="border-t border-white/10">
                <td className="py-1.5">{displayName(match, p, userId)}</td>
                <td className="text-white/80">{deltas[p] ?? 0}</td>
                <td className="font-semibold text-amber-200">{scores[p] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex justify-end gap-2">
          {complete ? (
            <button
              onClick={() => navigate({ to: "/lobby" })}
              className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-amber-300"
            >
              Back to lobby
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={onNext}
              className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-amber-300 disabled:opacity-40"
            >
              {pending ? "Starting…" : "Start next round"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ChatPanel({
  match,
  userId,
  onSend,
  pending,
  error,
}: {
  match: MatchView;
  userId: string;
  onSend: (text: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const messages: ChatMessage[] = match.chatMessages ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<number>(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (open) {
      // Scroll to bottom on open or new message.
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      lastSeenRef.current = messages.length > 0 ? messages[messages.length - 1].at : 0;
      setUnread(0);
    } else {
      const count = messages.filter((m) => m.at > lastSeenRef.current && m.userId !== userId).length;
      setUnread(count);
    }
  }, [open, messages, userId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-amber-300/30 bg-emerald-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-200/80">Table chat</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-2 text-white/60 hover:text-white"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>
          <div ref={scrollRef} className="max-h-72 min-h-[8rem] overflow-y-auto px-3 py-2 text-sm">
            {messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/40">No messages yet. Say hi!</p>
            ) : (
              <ul className="space-y-1.5">
                {messages.map((m) => {
                  const mine = m.userId === userId;
                  const name = displayName(match, m.userId, userId);
                  return (
                    <li key={m.id} className="leading-snug">
                      <span className={`mr-1 font-semibold ${mine ? "text-amber-200" : "text-emerald-300"}`}>
                        {name}:
                      </span>
                      <span className="text-white/90 break-words">{m.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder="Message the table…"
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-amber-300/60 focus:outline-none"
              maxLength={200}
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-amber-300 disabled:opacity-40"
            >
              Send
            </button>
          </form>
          {error && <p className="px-3 pb-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-full border border-amber-300/40 bg-black/60 px-4 py-2 text-sm font-semibold text-amber-100 shadow-lg backdrop-blur hover:bg-black/80"
      >
        <span>{open ? "Hide chat" : "Chat"}</span>
        {!open && unread > 0 && (
          <span className="ml-1 min-w-[1.25rem] rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold text-emerald-950">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}