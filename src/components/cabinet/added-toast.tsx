"use client";

import { useEffect } from "react";
import { Icon } from "./illustrations";

/** A short "Added to your wallet" note after an upload; tidies the URL so a refresh doesn't repeat it. */
export function AddedToast() {
  useEffect(() => {
    window.history.replaceState(null, "", "/app");
  }, []);
  return (
    <div role="status" className="cab-toast pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <span className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper shadow-lg">
        <Icon.Check className="h-4 w-4" /> Added to your wallet
      </span>
    </div>
  );
}
