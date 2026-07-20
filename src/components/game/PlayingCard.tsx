import { parseCard, suitSymbol, rankLabel, isRedSuit, isWild } from "@/lib/game/cards";
import { isCardUsedAsNatural } from "@/lib/game/melds";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "h-14 w-10 text-[10px]",
  md: "h-20 w-14 text-sm sm:h-24 sm:w-16 sm:text-base",
  lg: "h-24 w-16 text-base sm:h-32 sm:w-24 sm:text-lg",
};

const cornerSize: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-sm sm:text-base",
  lg: "text-base sm:text-lg",
};

const pipSize: Record<Size, string> = {
  sm: "text-xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-6xl",
};

export function PlayingCard({
  id,
  wildRank,
  size = "md",
  selected,
  faded,
  onClick,
  className = "",
  tint,
  meldContext,
}: {
  id: string;
  wildRank?: string | null;
  size?: Size;
  selected?: boolean;
  faded?: boolean;
  onClick?: () => void;
  className?: string;
  tint?: "meld" | "new" | null;
  meldContext?: string[];
}) {
  const c = parseCard(id);
  const usedAsNatural =
    meldContext && !c.joker && wildRank && c.rank === wildRank
      ? isCardUsedAsNatural(id, meldContext, wildRank)
      : false;
  const wild = isWild(id, wildRank) && !usedAsNatural;
  const tintBg =
    tint === "new"
      ? "border-sky-300 bg-gradient-to-br from-sky-100 to-sky-300 shadow-[0_2px_6px_rgba(0,0,0,0.35),inset_0_0_0_2px_rgba(56,189,248,0.55)]"
      : tint === "meld"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-amber-200 shadow-[0_2px_6px_rgba(0,0,0,0.35),inset_0_0_0_2px_rgba(251,191,36,0.55)]"
        : "border-slate-200 bg-gradient-to-br from-white to-slate-100 shadow-[0_2px_6px_rgba(0,0,0,0.35)]";
  const base = `relative select-none rounded-lg border ${tintBg} flex flex-col items-center justify-center font-semibold ${sizeClasses[size]}`;
  const state = [
    selected ? "ring-2 ring-amber-300 -translate-y-3 shadow-[0_8px_18px_rgba(0,0,0,0.5)]" : "",
    faded ? "opacity-40" : "",
    onClick ? "cursor-pointer transition-transform duration-150 hover:-translate-y-2 hover:shadow-[0_8px_18px_rgba(0,0,0,0.5)]" : "",
    wild ? "ring-1 ring-amber-400/70" : "",
  ].join(" ");

  if (c.joker) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${state} ${className}`}>
        <div className={`absolute left-1 top-1 leading-none ${cornerSize[size]} text-fuchsia-700`}>★</div>
        <div className={`absolute right-1 bottom-1 leading-none rotate-180 ${cornerSize[size]} text-fuchsia-700`}>★</div>
        <div className={`${pipSize[size]} leading-none text-fuchsia-600`}>★</div>
        <div className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-fuchsia-600/80">Joker</div>
      </button>
    );
  }

  const red = isRedSuit(c.suit);
  const color = wild ? "!text-amber-500" : red ? "!text-rose-600" : "!text-slate-900";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state} ${color} ${className}`}>
      <div className={`absolute left-1.5 top-1 flex flex-col items-center leading-none ${cornerSize[size]}`}>
        <span className="font-bold">{rankLabel(c.rank)}</span>
        <span>{suitSymbol(c.suit)}</span>
      </div>
      <div className={`absolute right-1.5 bottom-1 flex flex-col items-center leading-none rotate-180 ${cornerSize[size]}`}>
        <span className="font-bold">{rankLabel(c.rank)}</span>
        <span>{suitSymbol(c.suit)}</span>
      </div>
      <div className={`${pipSize[size]} leading-none`}>{suitSymbol(c.suit)}</div>
      {usedAsNatural && (
        <span
          className="absolute -top-1 -right-1 rounded-full bg-amber-400 px-1 py-px text-[8px] font-bold uppercase leading-none tracking-wider text-slate-900 ring-1 ring-amber-600 shadow"
          title="Wild card played as natural"
        >
          N
        </span>
      )}
    </button>
  );
}

export function CardBack({ size = "md", count }: { size?: Size; count?: number }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-lg border border-emerald-950/60 shadow-[0_2px_6px_rgba(0,0,0,0.45)] ${sizeClasses[size]}`}
      style={{
        background:
          "repeating-linear-gradient(45deg, #7f1d1d 0 6px, #991b1b 6px 12px), radial-gradient(circle at center, rgba(255,255,255,0.15), transparent 60%)",
        backgroundBlendMode: "overlay",
      }}
    >
      <div className="flex h-[70%] w-[70%] items-center justify-center rounded-md border border-amber-300/70 bg-gradient-to-br from-rose-900 to-rose-950 text-amber-200 shadow-inner">
        <span className="text-xl">✦</span>
      </div>
      {typeof count === "number" && (
        <span className="absolute -bottom-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-100 ring-1 ring-slate-700">
          {count}
        </span>
      )}
    </div>
  );
}

export function EmptyCardSlot({ size = "md", label }: { size?: Size; label?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-white/40 ${sizeClasses[size]}`}
    >
      {label}
    </div>
  );
}