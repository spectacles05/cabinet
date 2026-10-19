"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CabinetLogo } from "./brand";
import { Icon } from "./illustrations";
import { DemoBadge } from "./mode-controls";
import type { AppMode } from "@/lib/ai/mode";

const ITEMS = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/ask", label: "Ask" },
  { href: "/app/review", label: "Cover Check" },
  { href: "/app/claims", label: "Claims" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

const MENU_ITEM = "block rounded-xl px-3 py-2 hover:bg-paper";

/**
 * Phones: [+] Cabinet [avatar]. Large screens: logo, four links, Add, avatar.
 * While setting up (no policy saved yet) only the logo and the account menu are shown.
 */
export function AppNav({ initial, email, mode, contact, setup = false }: { initial: string; email: string; mode: AppMode; contact: boolean; setup?: boolean }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  // Close the profile menu after navigating from it.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 sm:px-6 md:flex">
        {setup ? (
          <span className="h-11 w-11 md:hidden" />
        ) : (
          <Link href="/app/upload" aria-label="Add a policy" className="cab-press grid h-11 w-11 place-items-center rounded-full bg-ink text-paper md:hidden">
            <Icon.Plus />
          </Link>
        )}
        <span className="flex items-center gap-2 justify-self-center">
          <Link href="/app" aria-label="Cabinet home" className="cab-press">
            <CabinetLogo />
          </Link>
          {mode === "demo" && (
            <Link href="/app/profile" aria-label="Demo Mode: change in your profile">
              <DemoBadge />
            </Link>
          )}
        </span>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {!setup && ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive(pathname, i.href, i.exact) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink"
              }`}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 justify-self-end md:ml-auto">
          {!setup && (
            <Link href="/app/upload" className="cab-press hidden items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper md:inline-flex">
              <Icon.Plus className="h-4 w-4" /> Add
            </Link>
          )}
          <details ref={menu} className="relative">
            <summary
              className="cab-press grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full bg-surface text-sm font-semibold text-ink shadow-sm [&::-webkit-details-marker]:hidden"
              aria-label="Account menu"
            >
              {initial}
            </summary>
            <nav aria-label="Account" className="absolute right-0 mt-2 w-56 rounded-2xl border border-line bg-surface p-2 text-sm shadow-xl">
              <p className="truncate px-3 pb-2 pt-1.5 text-xs text-ink-faint">{email}</p>
              <Link href="/app/profile" className={MENU_ITEM}>
                My profile
              </Link>
              {!setup && (
                <>
                  <Link href="/app/notifications" className={MENU_ITEM}>
                    Notifications
                  </Link>
                  <Link href="/app/claims" className={MENU_ITEM}>
                    Claims
                  </Link>
                </>
              )}
              <div className="my-1.5 h-px bg-line" />
              {contact && (
                <Link href="/contact" className={MENU_ITEM}>
                  Contact us
                </Link>
              )}
              <Link href="/faq" className={MENU_ITEM}>
                FAQ
              </Link>
              <Link href="/privacy" className={MENU_ITEM}>
                Privacy policy
              </Link>
              <Link href="/terms" className={MENU_ITEM}>
                Terms of use
              </Link>
              <div className="my-1.5 h-px bg-line" />
              <form action="/auth/signout" method="post">
                <button className="w-full rounded-xl px-3 py-2 text-left hover:bg-paper">Sign out</button>
              </form>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
