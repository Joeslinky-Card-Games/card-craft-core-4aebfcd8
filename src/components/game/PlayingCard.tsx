import { parseCard, suitSymbol, rankLabel, isRedSuit, isWild } from "@/lib/game/cards";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "h-14 w-10 text-[10px]",
  md: "h-24 w-16 text-sm",
  lg: "h-32 w-24 text-base",
};

const cornerSize: Record<Size, string> = {
  sm: "text-[9px]",
  md: "text-xs",
  lg: "text-sm",
};

const pipSize: Record<Size, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-5xl",
};

export function PlayingCard({
  id,
  wildRank,
  size = "md",
  selected,
  faded,
  onClick,
  className = "",
}: {
  id: string;
  wildRank?: string | null;
  size?: Size;
  selected?: boolean;
  faded?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const c = parseCard(id);
  const wild = isWild(id, wildRank);
  const base = `relative select-none rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-100 flex flex-col items-center justify-center font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.35)] ${sizeClasses[size]}`;
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
  const color = red ? "!text-rose-600" : "!text-slate-900";
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
      {wild && (
        <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
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