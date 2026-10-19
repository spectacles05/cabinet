import { Suspense } from "react";
import Link from "next/link";
import { CabinetLogo } from "@/components/cabinet/brand";
import { BearPeek, PenguinPeek, RabbitPeek } from "@/components/cabinet/animals";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Cabinet" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" aria-label="Cabinet home" className="cab-press self-center">
        <CabinetLogo />
      </Link>
      <h1 className="font-display mt-8 text-center text-[30px] font-normal leading-tight tracking-tight text-ink">Your insurance, made clear.</h1>
      <p className="mt-2 text-center text-[15px] text-ink-soft">Sign in to your wallet.</p>

      <div className="relative mt-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[44px] flex justify-around px-4">
          <RabbitPeek className="doodle-peek w-[76px]" />
          <BearPeek className="doodle-peek w-[76px] [animation-delay:0.65s]" />
          <PenguinPeek className="doodle-peek w-[76px] [animation-delay:0.8s]" />
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
