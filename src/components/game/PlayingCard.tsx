import { parseCard, suitSymbol, rankLabel, isRedSuit, isWild } from "@/lib/game/cards";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "h-14 w-10 text-[10px]",
  md: "h-20 w-14 text-sm",
  lg: "h-28 w-20 text-base",
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
  const base = `relative select-none rounded-md border shadow-sm bg-white text-slate-900 flex flex-col items-center justify-center font-semibold ${sizeClasses[size]}`;
  const state = [
    selected ? "ring-2 ring-primary -translate-y-2" : "",
    faded ? "opacity-40" : "",
    onClick ? "cursor-pointer transition-transform hover:-translate-y-1" : "",
    wild ? "ring-2 ring-amber-400" : "",
  ].join(" ");

  if (c.joker) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${state} ${className}`}>
        <span className="text-purple-600">JOKER</span>
        <span className="text-xs text-purple-600/70">wild</span>
      </button>
    );
  }

  const red = isRedSuit(c.suit);
  const color = red ? "text-red-600" : "text-slate-900";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state} ${color} ${className}`}>
      <div className="absolute left-1 top-0.5 text-xs leading-none">{rankLabel(c.rank)}</div>
      <div className="absolute right-1 bottom-0.5 text-xs leading-none rotate-180">{rankLabel(c.rank)}</div>
      <div className="text-xl leading-none">{suitSymbol(c.suit)}</div>
      {wild && <div className="mt-0.5 text-[9px] font-normal text-amber-600">wild</div>}
    </button>
  );
}

export function CardBack({ size = "md", count }: { size?: Size; count?: number }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-md border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300 shadow-sm ${sizeClasses[size]}`}
    >
      <span className="text-lg">♠</span>
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
      className={`flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground ${sizeClasses[size]}`}
    >
      {label}
    </div>
  );
}