"use client";

/** "Good evening, Alex" in the visitor's own time zone. */
export function Greeting({ name }: { name: string | null }) {
  const hour = new Date().getHours();
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return (
    <h1 className="font-display text-center text-[24px] font-medium tracking-tight text-ink lg:text-left lg:text-[30px]" suppressHydrationWarning>
      Good {part}
      {name ? <span>, {name}</span> : null}
    </h1>
  );
}
