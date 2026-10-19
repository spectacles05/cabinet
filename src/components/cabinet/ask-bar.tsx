import Link from "next/link";
import type { CSSProperties } from "react";
import { Peeker } from "./peeker";
import { Icon } from "./illustrations";

/** "Ask about your cover", with a bear peeking over the top edge of the bar. */
export function AskBar({
  href = "/app/ask",
  label = "Ask about your cover",
  className = "",
  style,
}: {
  href?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`relative mx-auto max-w-xl pt-12 ${className}`} style={style}>
      <Peeker animal="bear" inset="top-0" className="right-14" phrases={["Hi! Ask me anything.", "Try: am I covered abroad?", "I read your policies so you don't have to."]} />
      <Link
        href={href}
        className="cab-press relative z-10 flex items-center gap-3 rounded-full bg-surface py-2 pl-5 pr-2 shadow-sm hover:shadow"
      >
        <span className="flex-1 text-[15px] text-ink-faint">{label}</span>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-paper">
          <Icon.Ask className="h-5 w-5" />
        </span>
      </Link>
    </div>
  );
}
