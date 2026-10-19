import Link from "next/link";
import { PolicyScene } from "./policy-scenes";
import { folderTones } from "./theme";

/** The folder at the top of a policy or claim file: a labelled tab, a sheet peeking out, the cover. */
export function FolderHero({
  type,
  tab,
  title,
  subtitle,
  aside,
}: {
  type: string;
  tab: string;
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const { back, front, label } = folderTones(type);
  return (
    <div className="cab-rise relative mt-2 pt-8">
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-8 rounded-[28px] rounded-tl-none" style={{ background: back }} />
      <span
        aria-hidden="true"
        className="absolute left-[min(42%,13rem)] top-4 h-4 w-4"
        style={{ background: `radial-gradient(circle at 100% 0%, transparent 15.5px, ${back} 16px)` }}
      />
      <div className="absolute left-0 top-0 h-10 w-[min(42%,13rem)] rounded-t-[18px] px-6 pt-2.5" style={{ background: back }}>
        <span className="small-caps" style={{ color: label }}>
          {tab}
        </span>
      </div>
      <div aria-hidden="true" className="absolute inset-x-6 top-[52px] h-16 -rotate-[0.8deg] rounded-[12px] bg-[#fffdf9] shadow-[0_1px_2px_rgba(21,23,28,0.1)]" />
      <div className="relative mt-[34px] flex items-start gap-4 rounded-[28px] p-6 shadow-[0_1px_2px_rgba(21,23,28,0.05),0_26px_50px_-34px_rgba(21,23,28,0.35)]" style={{ background: front }}>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-normal leading-[1.15] tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle && <div className="mt-1.5 text-[14px] text-ink-soft">{subtitle}</div>}
        </div>
        {aside ?? <PolicyScene type={type} className="-my-2 h-auto w-[104px] shrink-0 sm:w-[132px]" />}
      </div>
    </div>
  );
}

/** Folder sections as a segmented control (links, so each section has its own address). */
export function FolderTabs({ label, tabs, active }: { label: string; tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav aria-label={label} className="mt-5 grid gap-1 rounded-full bg-paper-deep/70 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          scroll={false}
          className={`rounded-full py-2.5 text-center text-sm font-medium transition-colors ${
            active === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
