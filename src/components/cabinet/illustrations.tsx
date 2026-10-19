// Small UI icons on a 24px grid. (Illustrations live in animals.tsx and policy-scenes.tsx.)

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  Plus: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M12 5v14M5 12h14" {...ICON} />
    </svg>
  ),
  Ask: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" {...ICON} />
      <path d="M9.5 10a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3M12 17h.01" {...ICON} />
    </svg>
  ),
  Shield: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...ICON} />
      <path d="M8.5 12l2.5 2.5 4.5-5" {...ICON} />
    </svg>
  ),
  Home: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" {...ICON} />
    </svg>
  ),
  Activity: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M3 12h4l3-7 4 14 3-7h4" {...ICON} />
    </svg>
  ),
  Clock: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" {...ICON} />
      <path d="M12 7.5V12l3 2" {...ICON} />
    </svg>
  ),
  Copy: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="3" {...ICON} />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...ICON} />
    </svg>
  ),
  Question: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...ICON} />
      <path d="M10.5 11a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1M12.5 17h.01" {...ICON} />
    </svg>
  ),
  Ban: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" {...ICON} />
      <path d="M6 18L18 6" {...ICON} />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" {...ICON} />
    </svg>
  ),
  Doc: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...ICON} />
      <path d="M14 3v5h5M9 13h6M9 17h4" {...ICON} />
    </svg>
  ),
  Task: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" {...ICON} />
      <path d="M8.5 12l2.5 2.5 4.5-5" {...ICON} />
    </svg>
  ),
  ArrowLeft: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" {...ICON} />
    </svg>
  ),
  Pencil: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" {...ICON} />
      <path d="M13.5 6.5l4 4" {...ICON} />
    </svg>
  ),
  ArrowRight: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" {...ICON} />
    </svg>
  ),
  Alert: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" {...ICON} />
      <path d="M12 7.5v5.5M12 16.5h.01" {...ICON} />
    </svg>
  ),
  ArrowUp: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-5 w-5"} aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" {...ICON} />
    </svg>
  ),
  Lock: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-4 w-4"} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="3" {...ICON} />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...ICON} />
    </svg>
  ),
  Chevron: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={p.className ?? "h-4 w-4"} aria-hidden="true">
      <path d="M9 6l6 6-6 6" {...ICON} />
    </svg>
  ),
};
