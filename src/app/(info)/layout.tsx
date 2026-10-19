import Link from "next/link";
import type { ReactNode } from "react";
import { getUser } from "@/lib/supabase/server";
import { CabinetLogo } from "@/components/cabinet/brand";

/** FAQ, privacy, terms and contact: readable without signing in, with a way back into the app. */
export default async function InfoLayout({ children }: { children: ReactNode }) {
  const { user } = await getUser();
  const home = user ? "/app" : "/";
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-5 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href={home} aria-label="Cabinet home" className="cab-press">
          <CabinetLogo />
        </Link>
        <Link href={user ? "/app" : "/login"} className="text-sm font-medium text-ink-soft hover:text-ink">
          {user ? "Back to Cabinet" : "Sign in"}
        </Link>
      </header>
      <main className="flex-1 py-10">{children}</main>
      <footer className="flex flex-wrap gap-x-5 gap-y-1 pb-2 text-xs text-ink-faint">
        <Link href="/faq" className="hover:text-ink">
          FAQ
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        {process.env.CONTACT_EMAIL && (
          <Link href="/contact" className="hover:text-ink">
            Contact
          </Link>
        )}
      </footer>
    </div>
  );
}
