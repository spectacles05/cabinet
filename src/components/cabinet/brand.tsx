// Cabinet brand: three folders filed one behind another (ink, brass, pale brass), plus the wordmark.
import { useId } from "react";

// Drawn upright, then sheared so the folders lean back like files standing in a drawer.
const FRONT =
  "M0 447 Q0 427 20 427 L132 427 C152 427 152 471 176 471 L237 471 Q257 471 257 491 L257 618 Q257 638 237 638 L20 638 Q0 638 0 618 Z";
const MIDDLE = { x: 67, y: 375, w: 230, h: 221 };
const BACK = { x: 117, y: 342, w: 225, h: 196 };
const LEAN = "translate(10 -351) skewY(12.5)";

/** The mark on its own. Gaps between the folders are cut out, so it sits on any background. */
export function CabinetMark({ className = "h-7 w-7" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 362 362" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2e5cf" />
          <stop offset="1" stopColor="#d8bd92" />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6c38f" />
          <stop offset="1" stopColor="#b5843f" />
        </linearGradient>
        {/* Each folder is cut back where the one in front of it stands, leaving a thin gap. */}
        <mask id={`${id}cm`} maskUnits="userSpaceOnUse" x="-60" y="250" width="480" height="480">
          <rect x="-60" y="250" width="480" height="480" fill="#fff" />
          <path d={FRONT} fill="#000" stroke="#000" strokeWidth="22" strokeLinejoin="round" />
        </mask>
        <mask id={`${id}cb`} maskUnits="userSpaceOnUse" x="-60" y="250" width="480" height="480">
          <rect x="-60" y="250" width="480" height="480" fill="#fff" />
          <rect {...rect(MIDDLE)} fill="#000" stroke="#000" strokeWidth="20" />
          <path d={FRONT} fill="#000" stroke="#000" strokeWidth="22" strokeLinejoin="round" />
        </mask>
      </defs>
      <g transform={LEAN}>
        <rect {...rect(BACK)} fill={`url(#${id}b)`} mask={`url(#${id}cb)`} />
        <rect {...rect(MIDDLE)} fill={`url(#${id}m)`} mask={`url(#${id}cm)`} />
        <path d={FRONT} fill="#26272b" />
      </g>
    </svg>
  );
}

function rect(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x, y: r.y, width: r.w, height: r.h, rx: 20 };
}

export function CabinetLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <CabinetMark className="h-8 w-8" />
      <span className="font-display text-[23px] font-medium tracking-tight text-ink">Cabinet</span>
    </span>
  );
}
