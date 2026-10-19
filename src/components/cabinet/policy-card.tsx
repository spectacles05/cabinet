import Link from "next/link";
import { Icon } from "./illustrations";
import { RabbitInCabinet } from "./animals";
import { PolicyScene } from "./policy-scenes";
import { folderTones, themeFor } from "./theme";

export type WalletCardData = {
  href?: string;
  type: string;
  name: string;
  /** The one date that matters on the card, e.g. { label: "Expiry date", value: "2 November 2026" } */
  date: { label: string; value: string };
  /** Number of open things to check on this policy. */
  toCheck?: number;
  stamp?: "Sample" | "Example";
};

// Hover: the card rises a touch (pointer devices only, and never for reduced motion).
const LIFT = "transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-[3px]";
const SHADOW =
  "transition-shadow duration-300 shadow-[0_1px_2px_rgba(21,23,28,0.05),0_26px_50px_-30px_rgba(21,23,28,0.35)] group-hover:shadow-[0_1px_2px_rgba(21,23,28,0.05),0_34px_60px_-30px_rgba(21,23,28,0.45)]";

/** A policy in the wallet: a file folder with its type on the tab and the policy peeking out. */
export function WalletCard({ data }: { data: WalletCardData }) {
  const cls = "group block h-full rounded-[26px]";
  return data.href ? (
    <Link href={data.href} className={`${cls} cab-press`} aria-label={`${data.name}, ${data.date.label} ${data.date.value}`}>
      <Folder data={data} />
    </Link>
  ) : (
    <div className={cls}>
      <Folder data={data} />
    </div>
  );
}

const CHECK = (n?: number, className = "text-warn") =>
  n ? (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {n} to check
    </span>
  ) : null;

/** Each policy is a file in your cabinet: a tab with its type, the document peeking out, a doodle on the front. */
function Folder({ data }: { data: WalletCardData }) {
  const theme = themeFor(data.type);
  const { back, front, label } = folderTones(data.type);
  return (
    <div className={`relative h-full pt-8 ${LIFT}`}>
      {/* back of the folder and its tab */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-8 rounded-[26px] rounded-tl-none" style={{ background: back }} />
      <span
        aria-hidden="true"
        className="absolute left-[44%] top-4 h-4 w-4"
        style={{ background: `radial-gradient(circle at 100% 0%, transparent 15.5px, ${back} 16px)` }}
      />
      <div className="absolute left-0 top-0 h-10 w-[44%] rounded-t-[18px] px-5 pt-2.5" style={{ background: back }}>
        <span className="small-caps" style={{ color: label }}>
          {theme.label}
        </span>
      </div>
      {/* the policy itself, peeking out of the folder */}
      <div aria-hidden="true" className="absolute inset-x-5 top-[52px] h-24 -rotate-[1.2deg] rounded-[12px] bg-[#fffdf9] shadow-[0_1px_2px_rgba(21,23,28,0.1)]">
        <span className="absolute left-5 right-16 top-3 h-px bg-ink/15" />
      </div>
      {/* front of the folder */}
      <div className={`relative mt-[38px] flex min-h-[392px] flex-col rounded-[26px] px-6 pb-6 pt-5 ${SHADOW}`} style={{ background: front }}>
        <div className="flex h-5 justify-end">{data.stamp && <span className="small-caps text-ink-soft">{data.stamp}</span>}</div>
        <h3 className="font-display mt-2 text-[27px] font-normal leading-[1.15] tracking-tight text-ink line-clamp-2">{data.name}</h3>
        <div className="grid flex-1 place-items-center py-2">
          <PolicyScene type={data.type} className="h-auto w-full max-w-[236px]" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
          <div className="whitespace-nowrap">
            <p className="small-caps text-ink-soft">{data.date.label}</p>
            <p className="font-display mt-1 text-[21px] text-ink">{data.date.value}</p>
          </div>
          {CHECK(data.toCheck)}
        </div>
      </div>
    </div>
  );
}

/** Empty wallet: a rabbit peeking out of an empty cabinet, and one way forward. */
export function EmptyWalletCard() {
  return (
    <Link href="/app/upload" className="group cab-rise flex flex-col items-center px-6 pt-6 text-center">
      <RabbitInCabinet className="h-56 w-auto" />
      <p className="font-display mt-5 text-[26px] font-normal text-ink">Add your first policy</p>
      <span className="cab-press mt-5 grid h-12 w-12 place-items-center rounded-full bg-ink text-paper transition-transform group-hover:scale-105">
        <Icon.Plus />
      </span>
    </Link>
  );
}
