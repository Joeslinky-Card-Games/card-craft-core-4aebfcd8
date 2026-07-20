import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useUser } from "@clerk/tanstack-react-start";
import { useApi, endpoints, type Game, type GameAction, type MatchView, type ChatMessage } from "@/lib/api";
import { useClerkIdentity } from "@/lib/identity";
import { PlayingCard, CardBack, EmptyCardSlot } from "@/components/game/PlayingCard";
import { sortHand, cardPoints } from "@/lib/game/cards";
import { autoArrange, orderMeldForDisplay } from "@/lib/game/melds";
import { RulesDialog } from "@/components/game/RulesDialog";
import {
  ensureNotificationPermission,
  showNotification,
  playChatSound,
  playTurnSound,
} from "@/lib/notify";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StackAttackMatch } from "@/components/stackattack/StackAttackMatch";
import { ProfileDialog } from "@/components/profile/ProfileDialog";

// Simple context so any Avatar/name in the match tree can trigger the
// profile dialog without threading callbacks through several layers.
type ProfileTarget = { userId: string; name?: string | null; avatarUrl?: string | null };
const ProfileContext = createContext<((t: ProfileTarget) => void) | null>(null);
function useOpenProfile() {
  return useContext(ProfileContext);
}

export const Route = createFileRoute("/_authenticated/match/$matchId")({
  head: () => ({
    meta: [
      { title: "Match — ArcadiumX" },
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
  const api = useApi();
  const peek = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => api<MatchView>(`/matches/${matchId}`),
    refetchInterval: 2000,
    enabled: Boolean(matchId),
  });
  const gameId = peek.data?.gameId;
  if (gameId === "stack-attack") {
    return <StackAttackMatch matchId={matchId} />;
  }
  return <CharlottesWebMatchInner matchId={matchId} />;
}

function CharlottesWebMatchInner({ matchId }: { matchId: string }) {
  const { user } = useUser();
  const userId = user?.id ?? "";
  const selfImage = user?.imageUrl ?? null;
  const api = useApi();
  const qc = useQueryClient();
  const identity = useClerkIdentity();
  const navigate = useNavigate();

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
  const playAgainMut = useMutation({
    mutationFn: () => api<MatchView>(`/matches/${matchId}/play-again`, { method: "POST" }),
    onSuccess: (data) => {
      // When everyone votes to play again, the backend allocates a new
      // matchId and deletes the completed match row. Navigate to the new
      // match so we're not pointing at a deleted record.
      if (data.matchId && data.matchId !== matchId) {
        qc.setQueryData(["match", data.matchId], data);
        qc.removeQueries({ queryKey: ["match", matchId] });
        navigate({ to: "/match/$matchId", params: { matchId: data.matchId } });
        return;
      }
      qc.setQueryData(["match", matchId], data);
    },
  });
  const chatMut = useMutation({
    mutationFn: (text: string) =>
      api<MatchView>(`/matches/${matchId}/chat`, { method: "POST", body: { text } }),
    onSuccess: (data) => { qc.setQueryData(["match", matchId], data); },
  });
  const chatError = chatMut.error instanceof Error ? chatMut.error.message : null;
  const sendChat = (text: string) => chatMut.mutate(text);

  // Drive bot turns from the client with a small delay so each bot action
  // (draw / discard / lay-down) feels paced instead of teleporting. One
  // POST /ai-step per action; the effect re-runs on every state update and
  // schedules the next tick if the current player is still an AI.
  const currentMatch = query.data;
  const aiSet = useMemo(
    () => new Set(currentMatch?.aiPlayers ?? []),
    [currentMatch?.aiPlayers],
  );
  const orderList = currentMatch?._order ?? currentMatch?.players ?? [];
  const currentPlayerId =
    orderList.length > 0 && typeof currentMatch?.turn === "number"
      ? orderList[currentMatch.turn % orderList.length]
      : null;
  const botIsUp =
    currentMatch?.status === "in-progress" &&
    currentPlayerId != null &&
    aiSet.has(currentPlayerId);
  const tickKey = `${currentMatch?.version ?? 0}:${currentMatch?.hasDrawn ? 1 : 0}`;
  useEffect(() => {
    if (!botIsUp) return;
    // Feels like a human thinking: longer pause before the discard/lay-down
    // decision, shorter before the draw. Randomised across a 2–6s window.
    const delay = currentMatch?.hasDrawn
      ? 3500 + Math.floor(Math.random() * 2500) // 3.5–6s to "think" then play
      : 2000 + Math.floor(Math.random() * 2000); // 2–4s to pick up
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      api<MatchView>(`/matches/${matchId}/ai-step`, { method: "POST" })
        .then((data) => {
          if (!cancelled) qc.setQueryData(["match", matchId], data);
        })
        .catch(() => {
          /* transient — the next tick or the 2s poll will recover */
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botIsUp, tickKey, matchId]);

  if (query.isLoading) return <Centered>Loading match…</Centered>;
  if (query.error) return <Centered>Failed to load match. <button className="underline" onClick={invalidate}>Retry</button></Centered>;
  const match = query.data!;

  return (
    <MatchProfileScope>
      {match.status === "open" ? (
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
      ) : (
        <GameView
      match={match}
      userId={userId}
      selfImage={selfImage}
      onAction={(a) => actionMut.mutate(a)}
      onNextRound={() => nextRoundMut.mutate()}
      pending={actionMut.isPending || nextRoundMut.isPending}
      actionError={actionMut.error instanceof Error ? actionMut.error.message : null}
      onPlayAgain={() => playAgainMut.mutate()}
      playAgainPending={playAgainMut.isPending}
      onSendChat={sendChat}
      chatPending={chatMut.isPending}
      chatError={chatError}
    />
      )}
    </MatchProfileScope>
  );
}

// Wraps children with a ProfileContext and renders the ProfileDialog. Any
// avatar/name inside the match tree can call useOpenProfile() to bring it up.
function MatchProfileScope({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ProfileTarget | null>(null);
  const gamesQ = useQuery({
    queryKey: ["games"],
    queryFn: () => endpoints.listGames(),
    staleTime: 5 * 60 * 1000,
  });
  const games: Game[] = gamesQ.data?.games ?? [];
  return (
    <ProfileContext.Provider value={setTarget}>
      {children}
      <ProfileDialog
        open={Boolean(target)}
        onOpenChange={(v) => { if (!v) setTarget(null); }}
        userId={target?.userId ?? null}
        fallbackName={target?.name ?? null}
        fallbackAvatar={target?.avatarUrl ?? null}
        games={games}
      />
    </ProfileContext.Provider>
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
  onPlayAgain,
  playAgainPending,
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
  onPlayAgain: () => void;
  playAgainPending: boolean;
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

  // Ask for browser notification permission once, and prime audio on first
  // user interaction so autoplay policies don't block the sounds.
  useEffect(() => {
    ensureNotificationPermission();
    const prime = () => {
      // Touching the AudioContext during a user gesture unlocks playback.
      playTurnSound.length; // no-op reference to keep import
    };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  // Notify + play sound when it becomes the viewer's turn.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    const active = match.status === "in-progress";
    if (isMyTurn && active && !wasMyTurn.current) {
      playTurnSound();
      showNotification("Your turn", "It's your move in Charlotte's Web.", `turn:${match.matchId}`);
    }
    wasMyTurn.current = isMyTurn && active;
  }, [isMyTurn, match.status, match.turn, match.matchId]);

  // Notify + play sound on new chat messages from other players.
  const lastChatAtRef = useRef<number | null>(null);
  useEffect(() => {
    const msgs = match.chatMessages ?? [];
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (lastChatAtRef.current === null) {
      // Initialize baseline on first render so historical messages don't fire.
      lastChatAtRef.current = last.at;
      return;
    }
    if (last.at > lastChatAtRef.current && last.userId !== userId) {
      const name = displayName(match, last.userId, userId);
      playChatSound();
      showNotification(`${name} says…`, last.text, `chat:${match.matchId}`);
    }
    lastChatAtRef.current = last.at;
  }, [match.chatMessages, match, userId]);

  const dontShowAgain = () => {
    try { window.localStorage.setItem(RULES_KEY, "1"); } catch { /* ignore */ }
    setRulesOpen(false);
  };

  // Seat opponents in play order starting from the player immediately after
  // the viewer. The seat layout sweeps from lower-left → top → lower-right,
  // so opponents[0] sits to the viewer's left and play proceeds clockwise
  // around the table on every player's screen.
  const opponents = useMemo(() => {
    const seq = match._order && match._order.length > 0 ? match._order : match.players;
    const selfIdx = seq.indexOf(userId);
    if (selfIdx === -1) return seq.filter((p) => p !== userId);
    const rotated: string[] = [];
    for (let i = 1; i < seq.length; i++) {
      rotated.push(seq[(selfIdx + i) % seq.length]);
    }
    return rotated;
  }, [match._order, match.players, userId]);
  const goneOut = match.goneOutBy;
  const roundComplete = match.status === "round-complete";
  const matchComplete = match.status === "complete";
  const viewerDone = Boolean((goneOut && goneOut === userId) || match.laidMelds?.[userId]);
  // After someone goes out, each remaining player gets one final turn. Their
  // hand becomes visible to everyone once that turn has ended.
  const finalTurnDone = useMemo(() => {
    const set = new Set<string>();
    if (!goneOut || order.length === 0) return set;
    const startIdx = order.indexOf(goneOut);
    if (startIdx === -1) return set;
    const n = order.length;
    const completed = Math.max(0, (n - 1) - (match.remainingFinalTurns ?? 0));
    for (let i = 1; i <= completed; i++) {
      set.add(order[(startIdx + i) % n]);
    }
    return set;
  }, [goneOut, order, match.remainingFinalTurns]);

  // Announce the first "went out" event with a dismissible popup so it's not
  // easy to miss when opponents (or you) finish the round early.
  const [goneOutAnnouncement, setGoneOutAnnouncement] = useState<string | null>(null);
  const lastAnnouncedGoneOut = useRef<string | null>(null);
  useEffect(() => {
    if (goneOut && lastAnnouncedGoneOut.current !== goneOut) {
      lastAnnouncedGoneOut.current = goneOut;
      setGoneOutAnnouncement(goneOut);
    }
    if (!goneOut) {
      lastAnnouncedGoneOut.current = null;
    }
  }, [goneOut]);

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

  // Manual drag-and-drop ordering of unmelded cards. The user's ordering wins
  // for any card they've touched; anything else falls back to the auto-sorted
  // order. New cards (drawn from stock/discard) append at the end so they
  // don't jump around inside a custom sort.
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  useEffect(() => {
    setManualOrder((prev) => prev.filter((c) => myHand.includes(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHand.join("|")]);
  const orderedUnmelded = useMemo(() => {
    const inUnmelded = new Set(unmelded);
    const kept = manualOrder.filter((c) => inUnmelded.has(c));
    const rest = unmelded.filter((c) => !manualOrder.includes(c));
    return [...kept, ...rest];
  }, [unmelded, manualOrder]);
  const hasCustomSort = manualOrder.length > 0;
  const totalHandCards = arrangement.melds.flat().length + orderedUnmelded.length;
  const handLayoutKey = useMemo(
    () => `${arrangement.melds.map((m) => m.join(",")).join("|")}::${orderedUnmelded.join(",")}`,
    [arrangement.melds, orderedUnmelded],
  );
  // Dynamic squeeze: measure the row and apply negative margin to each
  // child after the first so cards always fit without horizontal scroll.
  const handRowRef = useRef<HTMLDivElement>(null);
  const [handSqueeze, setHandSqueeze] = useState(0);
  useLayoutEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    let frame = 0;
    let secondFrame = 0;
    const measure = () => {
      const node = handRowRef.current;
      if (!node) return;
      const children = Array.from(node.children) as HTMLElement[];
      if (children.length === 0) {
        setHandSqueeze(0);
        return;
      }
      // Because the row uses overflow-visible, scrollWidth equals clientWidth
      // even when children overflow. Sum children widths + gaps instead.
      const cs = getComputedStyle(node);
      const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
      let contentWidth = 0;
      for (const c of children) contentWidth += c.getBoundingClientRect().width;
      contentWidth += gap * (children.length - 1);
      // node.clientWidth can grow with its content because all ancestors up to
      // the page wrapper use overflow-visible (needed for the hover lift).
      // Use the viewport width minus the section's horizontal padding as the
      // real hard cap so cards never spill past the screen edge.
      const viewport = document.documentElement.clientWidth || window.innerWidth;
      const available = Math.min(node.clientWidth, viewport - 32);
      const overflow = contentWidth - available;
      const gaps = Math.max(1, children.length - 1);
      if (overflow <= 0) {
        setHandSqueeze(0);
      } else {
        setHandSqueeze(Math.ceil(overflow / gaps) + 2);
      }
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      frame = requestAnimationFrame(() => {
        measure();
        // Framer layout animations, drag/drop, and card re-melding can settle
        // one frame after React commits. Measure again after that settle frame
        // so squeeze stays correct without a refresh.
        secondFrame = requestAnimationFrame(measure);
      });
    };
    scheduleMeasure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(scheduleMeasure);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, [totalHandCards, handLayoutKey]);

  const dragSensors = useSensors(
    // Small activation distance so single-tap still fires the discard click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedUnmelded.indexOf(String(active.id));
    const newIdx = orderedUnmelded.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setManualOrder(arrayMove(orderedUnmelded, oldIdx, newIdx));
  };

  const canLayDown = arrangement.complete && arrangement.discard !== null && isMyTurn && Boolean(match.hasDrawn) && !roundComplete && !matchComplete;
  const canDiscard = isMyTurn && Boolean(match.hasDrawn) && !roundComplete && !matchComplete;

  const goOutOptions = arrangement.goOutOptions ?? [];
  const [pickingGoOutDiscard, setPickingGoOutDiscard] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);

  // Reset the picker if the state that gates it changes.
  useEffect(() => {
    if (!canLayDown || goOutOptions.length <= 1) setPickingGoOutDiscard(false);
  }, [canLayDown, goOutOptions.length]);

  // Clear any pending discard when it no longer applies (turn changed, hand
  // updated, round ended, etc.).
  useEffect(() => {
    if (!canDiscard) { setPendingDiscard(null); return; }
    if (pendingDiscard && !myHand.includes(pendingDiscard)) setPendingDiscard(null);
  }, [canDiscard, pendingDiscard, myHand]);

  const handleCardClick = (card: string) => {
    if (pickingGoOutDiscard) return; // picker modal handles selection
    if (!canDiscard) return;
    // Two-tap confirm: first tap selects, second tap on same card discards.
    // Cards can sit very close together on mobile, so require an explicit
    // confirmation before committing.
    setPendingDiscard(card);
  };

  const confirmDiscard = () => {
    if (!pendingDiscard || !canDiscard) return;
    const card = pendingDiscard;
    setPendingDiscard(null);
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
    <main
      className="relative isolate min-h-[calc(100vh-4rem-1px)] min-h-[calc(100dvh-4rem-1px)] w-full overflow-x-hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Room: back wall */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(180deg, #1a0f0a 0%, #2a1810 45%, #1e1108 62%, #1e1108 100%)",
        }}
      />
      {/* Room: wooden floor (lower portion) with perspective */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[58%]"
        style={{
          background:
            "linear-gradient(180deg, #2a1a10 0%, #4a2d1a 25%, #3a2312 70%, #1f120a 100%)",
        }}
      />
      {/* Floor plank streaks */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[58%] opacity-40 mix-blend-overlay"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 60px, rgba(0,0,0,0.35) 60px 62px, transparent 62px 130px, rgba(255,220,180,0.05) 130px 132px)",
        }}
      />
      {/* Wall/floor seam shadow */}
      <div
        className="pointer-events-none absolute inset-x-0 z-0 h-16"
        style={{
          bottom: "58%",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
        }}
      />
      {/* Overhead light cone spilling onto wall */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255,214,140,0.18) 0%, rgba(255,190,110,0.08) 35%, rgba(0,0,0,0) 70%)",
        }}
      />
      {/* Vignette to sink the room edges */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
          <Link to="/lobby" className="text-white/70 underline hover:text-white">← Lobby</Link>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-amber-300/30 bg-black/25 px-3 py-1.5 text-white/80 shadow backdrop-blur sm:gap-x-4 sm:rounded-full sm:px-4">
              <span>R <b className="text-amber-200">{match.round}/13</b></span>
              <span className="text-white/30">·</span>
              <span>Hand <b className="text-amber-200">{match.handSize}</b></span>
              <span className="text-white/30">·</span>
              <span>Wild <b className="text-amber-300">{wildRank === null ? "—" : wildRank === "T" ? "10" : wildRank}</b>+★</span>
              <span className="text-white/30">·</span>
              <button
                type="button"
                onClick={() => setRulesOpen(true)}
                className="rounded-full px-1 text-amber-200 hover:text-amber-100"
              >
                Rules
              </button>
            </div>
            <div className="rounded-2xl border border-emerald-300/30 bg-black/25 px-3 py-1.5 text-white/90 shadow backdrop-blur sm:rounded-full sm:px-4">
              Score <b className="text-amber-200">{match.scores?.[userId] ?? 0}</b>
            </div>
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
          matchComplete={matchComplete}
          viewerDone={viewerDone}
          finalTurnDone={finalTurnDone}
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
        className={`relative z-20 mt-6 overflow-visible rounded-2xl p-3 transition-all duration-300 ${
          isMyTurn && !roundComplete && !matchComplete
            ? "bg-amber-400/10 shadow-[0_0_28px_rgba(251,191,36,0.55)] ring-2 ring-amber-300"
            : "ring-1 ring-transparent"
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-200/70">
            Hand Score: <b className="text-amber-100">{unmeldedScore}</b>
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
          {hasCustomSort && (
            <button
              onClick={() => setManualOrder([])}
              className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70 hover:bg-white/10 hover:text-white"
              title="Return to auto-sorted order"
            >
              Reset sort
            </button>
          )}
        </div>

        <LayoutGroup>
          {/* Single hand row: melds (condensed/overlapping) + unmelded cards */}
          <div className="relative z-30 overflow-visible pt-6 pb-2">
          <div
            ref={handRowRef}
            className="relative z-30 flex min-h-[6.5rem] flex-nowrap items-center justify-center overflow-visible pb-1 sm:min-h-[8.5rem] gap-x-1 sm:gap-x-2 [&>*+*]:[margin-left:calc(var(--hand-squeeze,0px)*-1)]"
            style={{ ["--hand-squeeze" as unknown as string]: `${handSqueeze}px` }}
          >
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
                    className="group relative z-10 flex items-end rounded-lg p-2 ring-1 ring-amber-300/40"
                    title={`Meld #${mi + 1}`}
                  >
                    {meld.map((c, i) => (
                      <motion.div
                        key={c}
                        layoutId={`card-${c}`}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        className={`relative ${i === 0 ? "" : "-ml-10 sm:-ml-14"}`}
                        style={{ zIndex: i }}
                      >
                        <PlayingCard
                          id={c}
                          wildRank={wildRank}
                          size="lg"
                          onClick={() => handleCardClick(c)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                  );
                })}
                <DndContext
                  sensors={dragSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={orderedUnmelded} strategy={horizontalListSortingStrategy}>
                    {orderedUnmelded.map((c, i) => (
                      <SortableCard
                        key={c}
                        id={c}
                        wildRank={wildRank}
                        index={i}
                        size="lg"
                        onClick={() => handleCardClick(c)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
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
          onPlayAgain={onPlayAgain}
          playAgainPending={playAgainPending}
        />
      )}

      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        onDontShowAgain={dontShowAgain}
        gameId={match.gameId}
      />
      {goneOutAnnouncement && !roundComplete && !matchComplete && (
        <WentOutAnnouncement
          name={displayName(match, goneOutAnnouncement, userId)}
          isSelf={goneOutAnnouncement === userId}
          remaining={match.remainingFinalTurns ?? 0}
          onClose={() => setGoneOutAnnouncement(null)}
        />
      )}
      {pickingGoOutDiscard && (
        <GoOutOptionsPicker
          options={goOutOptions}
          wildRank={wildRank}
          pending={pending}
          onCancel={() => setPickingGoOutDiscard(false)}
          onPick={handlePickOption}
        />
      )}
      {pendingDiscard && (
        <DiscardConfirm
          card={pendingDiscard}
          wildRank={wildRank}
          pending={pending}
          onCancel={() => setPendingDiscard(null)}
          onConfirm={confirmDiscard}
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
  matchComplete,
  viewerDone,
  finalTurnDone,
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
  matchComplete: boolean;
  viewerDone: boolean;
  finalTurnDone: Set<string>;
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
    <div className="relative mx-auto aspect-[4/3] w-full max-w-4xl max-h-[min(55dvh,28rem)] sm:aspect-[16/9]">
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
              hand={match.hands?.[p]}
              handVisible={roundComplete || matchComplete || finalTurnDone.has(p)}
              wildRank={wildRank}
            />
          </div>
        );
      })}

      {/* Center piles */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 sm:gap-6">
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
                className={`relative h-24 w-16 rounded-lg sm:h-32 sm:w-24 ${canDrawDiscard ? "cursor-pointer shadow-[0_0_18px_rgba(251,191,36,0.35)] ring-2 ring-amber-300/70" : "cursor-default"} disabled:opacity-80`}
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
  const openProfile = useOpenProfile();
  const inner = imageUrl ? (
    <img
        src={imageUrl}
        alt={name}
        className={`${dim} rounded-full object-cover shadow-inner ring-2 ring-black/30`}
      />
  ) : (
    <div
      className={`flex ${dim} items-center justify-center rounded-full font-bold text-white shadow-inner ring-2 ring-black/30`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 40) % 360} 65% 30%))` }}
    >
      {initialsOf(name)}
    </div>
  );
  if (!openProfile || !userId) return inner;
  return (
    <button
      type="button"
      onClick={() => openProfile({ userId, name, avatarUrl: imageUrl ?? null })}
      className="rounded-full transition hover:scale-105 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      title={`View ${name}'s profile`}
    >
      {inner}
    </button>
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
  hand,
  handVisible,
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
  hand?: string[];
  handVisible: boolean;
  wildRank: string | null;
}) {
  // Laid-down melds and final hands crowd the table when several players go
  // out — open in a full-screen modal on demand so nothing obstructs the table UI.
  const [meldsOpen, setMeldsOpen] = useState(false);
  const meldCount = laidMelds?.reduce((s, m) => s + m.length, 0) ?? 0;
  const canShowHand = (laidMelds && laidMelds.length > 0) || (handVisible && hand && hand.length > 0);
  return (
    <div
      className={`flex w-max min-w-[10rem] flex-col items-center gap-1 rounded-xl px-3 py-2 backdrop-blur transition-all ${
        isTurn
          ? "bg-amber-400/15 shadow-[0_0_24px_rgba(251,191,36,0.5)] ring-2 ring-amber-300"
          : "bg-black/40 ring-1 ring-white/10"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={name} userId={userId} imageUrl={imageUrl} />
        <div className="min-w-0 text-left leading-tight">
          <div className="break-words text-sm font-semibold text-white">{name}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">
            total <span className="text-amber-200">{score}</span>
          </div>
        </div>
      </div>
      {canShowHand ? (
        <div className="mt-1 flex w-full flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setMeldsOpen((v) => !v)}
            className="w-full rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/30"
            aria-expanded={meldsOpen}
          >
            Show hand
          </button>
          {meldsOpen && (
            <LaidMeldsDialog
              name={name}
              laidMelds={laidMelds}
              hand={hand}
              wildRank={wildRank}
              onClose={() => setMeldsOpen(false)}
            />
          )}
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
          <span className="absolute -bottom-3 z-10 rounded-full bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow ring-1 ring-white/20">
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

function LaidMeldsDialog({
  name,
  laidMelds,
  hand,
  wildRank,
  onClose,
}: {
  name: string;
  laidMelds?: string[][];
  hand?: string[];
  wildRank: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Auto-arrange the remaining (un-laid) hand so viewers can see potential
  // melds vs deadwood at a glance to estimate points.
  const handArrangement = useMemo(
    () => (hand && hand.length > 0 ? autoArrange(hand, wildRank) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hand ? hand.join("|") : "", wildRank],
  );
  const handMelds = handArrangement?.melds ?? [];
  const meldedInHand = new Set(handMelds.flat());
  const deadwood = hand ? sortHand(hand.filter((c) => !meldedInHand.has(c)), wildRank) : [];
  const deadwoodPoints = deadwood.reduce((s, c) => s + cardPoints(c), 0);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 to-emerald-900 p-4 text-white shadow-2xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-bold text-amber-100 sm:text-xl">{name}'s hand</h2>
            <p className="text-[11px] uppercase tracking-wider text-white/60">
              {laidMelds && laidMelds.length > 0
                ? `${laidMelds.length} meld${laidMelds.length === 1 ? "" : "s"} laid down`
                : hand && hand.length > 0
                  ? `${hand.length} card${hand.length === 1 ? "" : "s"} remaining`
                  : "No cards to show"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/80 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>
        {laidMelds && laidMelds.length > 0 && (
          <div className="flex flex-wrap items-start justify-center gap-3">
            {laidMelds.map((meld, i) => (
              <div key={i} className="rounded-lg bg-emerald-900/50 px-2 py-1 ring-1 ring-amber-300/40">
                <div className="flex -space-x-6 sm:-space-x-8">
                  {orderMeldForDisplay(meld, wildRank).map((c) => (
                    <PlayingCard key={c} id={c} wildRank={wildRank} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {handMelds.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-white/50">
              Melds
            </div>
            <div className="flex flex-wrap items-start justify-center gap-3">
              {handMelds.map((meld, i) => (
                <div key={i} className="rounded-lg bg-emerald-900/30 px-2 py-1 ring-1 ring-white/20">
                  <div className="flex -space-x-6 sm:-space-x-8">
                    {orderMeldForDisplay(meld, wildRank).map((c) => (
                      <PlayingCard key={c} id={c} wildRank={wildRank} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {deadwood.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-white/50">
              Deadwood · {deadwoodPoints} pt{deadwoodPoints === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-start justify-center gap-2">
              {deadwood.map((c) => (
                <PlayingCard key={c} id={c} wildRank={wildRank} />
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}

function WentOutAnnouncement({
  name,
  isSelf,
  remaining,
  onClose,
}: {
  name: string;
  isSelf: boolean;
  remaining: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border-2 border-amber-300/60 bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 text-center text-white shadow-[0_0_60px_rgba(251,191,36,0.4)]"
      >
        <div className="mb-2 text-5xl">🎉</div>
        <h2 className="font-serif text-2xl font-bold text-amber-100">
          {isSelf ? "You went out!" : `${name} went out!`}
        </h2>
        <p className="mt-2 text-sm text-white/80">
          {remaining > 0
            ? "Everyone else has one final turn before the round ends."
            : "The round is ending now."}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-full bg-amber-400 px-6 py-2 text-sm font-bold uppercase tracking-wider text-emerald-950 shadow hover:bg-amber-300"
        >
          Got it
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

function RoundSummary({
  match,
  userId,
  onNext,
  pending,
  onPlayAgain,
  playAgainPending,
}: {
  match: MatchView;
  userId: string;
  onNext: () => void;
  pending: boolean;
  onPlayAgain: () => void;
  playAgainPending: boolean;
}) {
  const navigate = useNavigate();
  const deltas = match.lastRoundScores ?? {};
  const scores = match.scores ?? {};
  const complete = match.status === "complete";
  const sorted = [...match.players].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0));
  const votes = new Set(match.playAgain ?? []);
  const myVote = votes.has(userId);
  const votedCount = match.players.filter((p) => votes.has(p)).length;
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
            <>
              <div className="mr-auto text-left text-xs text-white/70">
                <div className="font-semibold uppercase tracking-widest text-amber-200/70">
                  Play again — {votedCount}/{match.players.length} ready
                </div>
                <ul className="mt-1 space-y-0.5">
                  {match.players.map((p) => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span
                        className={
                          votes.has(p)
                            ? "inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                            : "inline-block h-1.5 w-1.5 rounded-full bg-white/25"
                        }
                      />
                      <span className={votes.has(p) ? "text-emerald-200" : "text-white/60"}>
                        {displayName(match, p, userId)}
                        {votes.has(p) ? " · ready" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => navigate({ to: "/lobby" })}
                className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
              >
                Lobby
              </button>
              <button
                onClick={onPlayAgain}
                disabled={myVote || playAgainPending}
                className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {myVote ? "Waiting for others…" : playAgainPending ? "Voting…" : "Play again"}
              </button>
            </>
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
    <div
      className="fixed right-3 z-40 flex flex-col items-end sm:right-4"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
      }}
    >
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
          <div ref={scrollRef} className="max-h-[min(18rem,50dvh)] min-h-[6rem] overflow-y-auto px-3 py-2 text-sm">
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
        className="relative flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-black/60 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur hover:bg-black/80 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
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

function SortableCard({
  id,
  wildRank,
  index,
  size,
  onClick,
}: {
  id: string;
  wildRank: string | null;
  index?: number;
  size?: "sm" | "md" | "lg";
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : (index ?? 0) + 20,
    opacity: isDragging ? 0.85 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative">
      <PlayingCard id={id} wildRank={wildRank} size={size} onClick={onClick} />
    </div>
  );
}

function DiscardConfirm({
  card,
  wildRank,
  pending,
  onCancel,
  onConfirm,
}: {
  card: string;
  wildRank: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 to-emerald-900 p-5 text-white shadow-2xl"
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-200/80">
          Discard this card?
        </h2>
        <div className="mt-4 flex justify-center">
          <PlayingCard id={card} wildRank={wildRank} size="lg" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-amber-300 disabled:opacity-40"
          >
            {pending ? "Discarding…" : "Discard"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function GoOutOptionsPicker({
  options,
  wildRank,
  pending,
  onCancel,
  onPick,
}: {
  options: { discard: string; melds: string[][] }[];
  wildRank: string | null;
  pending: boolean;
  onCancel: () => void;
  onPick: (opt: { discard: string; melds: string[][] }) => void;
}) {
  // Deduplicate by discard rank+suit (ignore deck copy) so equivalent
  // options aren't shown twice when the hand contains duplicate cards.
  const seen = new Set<string>();
  const unique = options.filter((o) => {
    const key = o.discard.startsWith("JK") ? "JK" : o.discard.slice(0, 2);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-4">
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col rounded-2xl border border-amber-300/30 bg-gradient-to-br from-emerald-950 to-emerald-900 p-4 text-white shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-amber-100">Pick how to go out</h2>
            <p className="mt-1 text-sm text-white/70">
              You have multiple valid lay-downs. Each option shows the melds you'll keep and the card that will be discarded.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Cancel"
          >
            ×
          </button>
        </div>

        <ul className="-mr-1 flex-1 space-y-3 overflow-y-auto pr-1">
          {unique.map((opt, idx) => (
            <li key={opt.discard}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(opt)}
                className="group flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-left transition hover:border-amber-300/60 hover:bg-black/50 disabled:opacity-50 sm:flex-row sm:items-center"
              >
                <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/60 group-hover:text-white/80">
                  Option {idx + 1}
                </span>

                {/* Kept melds — emerald frame */}
                <div className="flex flex-1 flex-wrap items-end gap-x-4 gap-y-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Keep</span>
                  {opt.melds.map((rawMeld, mi) => {
                    const meld = orderMeldForDisplay(rawMeld, wildRank);
                    return (
                      <div
                        key={mi}
                        className="flex items-end rounded-lg bg-emerald-900/60 px-1.5 py-1 ring-1 ring-emerald-400/40"
                      >
                        {meld.map((c, i) => (
                          <div
                            key={c}
                            style={{ marginLeft: i === 0 ? 0 : -28, zIndex: i }}
                          >
                            <PlayingCard id={c} wildRank={wildRank} size="sm" />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Discard — rose frame, visually separated */}
                <div className="flex shrink-0 items-end gap-2 border-t border-white/10 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-rose-300">Discard</span>
                    <div className="rounded-lg bg-rose-950/50 p-1 ring-2 ring-rose-400/70">
                      <PlayingCard id={opt.discard} wildRank={wildRank} size="sm" />
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}