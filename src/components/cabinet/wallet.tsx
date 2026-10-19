"use client";

import { useEffect, useRef, useState } from "react";
import { WalletCard, type WalletCardData } from "./policy-card";

/**
 * Swipeable wallet of policy cards with position dots; a simple row on large screens.
 * The track runs edge to edge with room above and below, so cards slide in from the screen edge
 * and their hover lift and shadow are never clipped by the scroller.
 */
export function Wallet({ cards, focus }: { cards: WalletCardData[]; focus?: string | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const focused = useRef(false);

  // Bring a just-added card to the middle (phones), once.
  useEffect(() => {
    const el = track.current;
    const i = cards.findIndex((c) => c.href === focus);
    const item = el?.children[i] as HTMLElement | undefined;
    if (focused.current || !el || !item) return;
    focused.current = true;
    const [box, it] = [el.getBoundingClientRect(), item.getBoundingClientRect()];
    el.scrollTo({ left: el.scrollLeft + it.left - box.left - (box.width - it.width) / 2 });
  }, [focus, cards]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(items.indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [cards.length]);

  function go(i: number) {
    const item = track.current?.children[i] as HTMLElement | undefined;
    item?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  return (
    <div className="cab-rise" style={{ animationDelay: "60ms" }}>
      <div
        ref={track}
        className="no-scrollbar -mb-8 -mt-6 mx-[calc(50%-50vw)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[calc(50vw-min(13rem,41vw))] pb-12 pt-6 lg:mx-0 lg:my-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:py-0"
      >
        {cards.map((c) => (
          <div key={c.href ?? c.name} className="w-[min(26rem,82vw)] shrink-0 snap-center lg:w-auto">
            <WalletCard data={c} />
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="mt-4 flex justify-center gap-2 lg:hidden" role="tablist" aria-label="Policies">
          {cards.map((c, i) => (
            <button
              key={c.href ?? c.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={c.name}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-ink" : "w-2 bg-ink/20"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
