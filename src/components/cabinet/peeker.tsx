"use client";

import { useEffect, useRef, useState } from "react";
import { BearPeek, DuckPeek, FoxPeek, HedgehogPeek, PenguinPeek, RabbitPeek } from "./animals";

const PEEKERS = { fox: FoxPeek, bear: BearPeek, penguin: PenguinPeek, rabbit: RabbitPeek, hedgehog: HedgehogPeek, duck: DuckPeek };
export type Animal = keyof typeof PEEKERS;

/**
 * A short line in a speech bubble (on tap, or when `say` changes) plus a reaction. Two identical
 * animations are alternated so every tap replays the reaction without remounting the drawing.
 */
function useReaction(phrases: string[], say?: string | null, sayKey?: number) {
  const [bubble, setBubble] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const next = useRef(0);
  // A new `say` (or the same one with a new key) shows straight away: adjusting state to a prop change.
  const signal = say ? `${say}|${sayKey ?? ""}` : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (signal !== seen) {
    setSeen(signal);
    if (signal && say) {
      setBubble(say);
      setCount((c) => c + 1);
    }
  }
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 2400);
    return () => clearTimeout(t);
  }, [bubble, count]);
  const poke = () => {
    if (!phrases.length) return;
    setBubble(phrases[next.current % phrases.length]);
    setCount((c) => c + 1);
    next.current++;
  };
  return { bubble, poke, flip: count ? (count % 2 ? "a" : "b") : null };
}

function Bubble({ text, className }: { text: string; className: string }) {
  return (
    <span
      role="status"
      className={`cab-bubble pointer-events-none absolute z-20 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-[12px] font-medium text-ink shadow-[0_2px_10px_-2px_rgba(21,23,28,0.25)] ${className}`}
    >
      {text}
    </span>
  );
}

/**
 * An animal peeking over the top edge of the box after it (place it first; give the box
 * `relative z-10`). With `side`, on wider screens it peers round the box's right-hand edge,
 * turned on its side. A tap makes it duck behind the edge and pop back up, so the edge it's
 * drawn against is never seen.
 */
export function Peeker({
  animal,
  phrases,
  say,
  sayKey,
  side = false,
  inset = "bottom-[calc(100%-4px)]",
  className = "",
}: {
  animal: Animal;
  phrases: string[];
  /** Say this now (e.g. "Let me look…"); change `sayKey` to say it again. */
  say?: string | null;
  sayKey?: number;
  side?: boolean;
  /** Vertical placement; by default it sits just above the box. */
  inset?: string;
  /** Horizontal position, e.g. "right-8". The bubble opens to its left. */
  className?: string;
}) {
  const A = PEEKERS[animal];
  const { bubble, poke, flip } = useReaction(phrases, say, sayKey);
  const place = side
    ? `${inset} h-[50px] w-[84px] md:bottom-auto md:right-auto md:top-10 md:left-[calc(100%-4px)] md:h-[84px] md:w-[50px]`
    : `${inset} h-[50px] w-[84px]`;
  return (
    <button type="button" onClick={poke} aria-label={`Say hello to the ${animal}`} className={`group absolute z-0 ${place} ${className}`}>
      {/* On its side (wider screens), its "bottom" is the box's edge: everything below stays local to that edge. */}
      <span className={`block h-[50px] w-[84px] ${side ? "md:origin-top-left md:translate-x-[50px] md:rotate-90" : ""}`}>
        <span className={`block h-full w-full ${flip ? `cab-pop-${flip}` : ""}`}>
          <span className="block h-full w-full origin-bottom transition-transform duration-300 group-hover:scale-[1.06]">
            <A className="doodle-peek block w-full" />
          </span>
        </span>
      </span>
      {bubble && <Bubble text={bubble} className={`right-[calc(100%+6px)] top-2 ${side ? "md:left-[calc(100%+6px)] md:right-auto md:top-6" : ""}`} />}
    </button>
  );
}

/**
 * A whole animal doing its own thing (reading, holding a document, sitting in the cabinet).
 * A tap makes it hop and say something short; `say` makes it speak on cue (e.g. "Filed!").
 */
export function Boop({
  phrases,
  label,
  say,
  sayKey,
  bubbleSide = "top",
  className = "",
  children,
}: {
  phrases: string[];
  label: string;
  say?: string | null;
  sayKey?: number;
  /** Where the bubble appears: above it, below it (from its left edge), or beside it. */
  bubbleSide?: "top" | "below" | "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const { bubble, poke, flip } = useReaction(phrases, say, sayKey);
  const at =
    bubbleSide === "left"
      ? "right-[calc(100%+4px)] top-1"
      : bubbleSide === "right"
        ? "left-[calc(100%+4px)] top-1"
        : bubbleSide === "below"
          ? "left-2 top-[calc(100%+2px)]"
          : "bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2";
  return (
    <button type="button" onClick={poke} aria-label={label} className={`group inline-block ${className.split(" ").includes("absolute") ? "" : "relative"} ${className}`}>
      <span className={`block ${flip ? `cab-hop-${flip}` : ""}`}>
        <span className="block origin-bottom transition-transform duration-300 group-hover:scale-[1.04]">{children}</span>
      </span>
      {bubble && <Bubble text={bubble} className={at} />}
    </button>
  );
}
