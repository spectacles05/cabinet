import Link from "next/link";
import { CabinetLogo } from "@/components/cabinet/brand";
import { BearReading, FoxMagnifier, PenguinWithPolicy, RabbitInCabinet } from "@/components/cabinet/animals";

const MOMENTS = [
  { Art: PenguinWithPolicy, title: "Add a policy", line: "Drop in a PDF." },
  { Art: BearReading, title: "Ask anything", line: "Plain answers, with the page." },
  { Art: FoxMagnifier, title: "Check your cover", line: "Gaps and renewals, flagged early." },
];

export default function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-5 sm:px-8">
      <header className="flex items-center justify-between">
        <CabinetLogo />
        <Link href="/login" className="text-sm font-medium text-ink-soft hover:text-ink">
          Sign in
        </Link>
      </header>

      <section className="grid flex-1 items-center gap-8 py-10 md:grid-cols-[1.15fr_1fr] md:gap-10 md:py-20">
        <div className="cab-rise text-center md:text-left">
          <h1 className="font-display text-[42px] font-normal leading-[1.04] tracking-tight text-ink sm:text-[58px]">
            Know what you&apos;re covered for.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft md:mx-0">All your insurance in one place. Ask it anything.</p>
          <div className="mt-8 flex justify-center md:justify-start">
            <Link href="/login" className="cab-press rounded-full bg-ink px-8 py-3.5 text-[15px] font-semibold text-paper">
              Get started
            </Link>
          </div>
        </div>
        <div className="cab-rise order-first flex justify-center md:order-none" style={{ animationDelay: "120ms" }}>
          <RabbitInCabinet className="h-48 w-auto sm:h-64 md:h-80" />
        </div>
      </section>

      <section className="grid gap-10 pb-14 sm:grid-cols-3 sm:gap-8">
        {MOMENTS.map(({ Art, title, line }) => (
          <div key={title} className="flex flex-col items-center text-center">
            <div className="grid h-36 place-items-center">
              <Art className="h-32 w-auto" />
            </div>
            <h2 className="font-display mt-4 text-[21px] font-normal text-ink">{title}</h2>
            <p className="mt-1 text-[14px] text-ink-soft">{line}</p>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-1 pb-4 text-xs text-ink-faint">
        <span>Information only, not insurance advice.</span>
        <Link href="/faq" className="hover:text-ink">
          FAQ
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
      </footer>
    </main>
  );
}
