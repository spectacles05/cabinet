// Per-policy-type colours: a soft tint and a deep tone, from which the folder colours are made.

export type TypeTheme = { label: string; tint: string; deep: string };

export const TYPE_THEME: Record<string, TypeTheme> = {
  travel: { label: "Travel", tint: "#dbe8f4", deep: "#2f6ea6" },
  contents: { label: "Home", tint: "#f3e0d3", deep: "#b0582e" },
  renters: { label: "Renters", tint: "#f3e0d3", deep: "#b0582e" },
  gadget: { label: "Gadget", tint: "#e4def6", deep: "#5a48b5" },
  car: { label: "Car", tint: "#dcebdf", deep: "#2e7a4e" },
  pet: { label: "Pet", tint: "#f5e7c4", deep: "#9c7212" },
  health: { label: "Health", tint: "#d8eeea", deep: "#1e7d70" },
  life: { label: "Life", tint: "#f3dbe1", deep: "#a3425c" },
  other: { label: "Policy", tint: "#e9e5de", deep: "#5d626c" },
};

export function themeFor(type: string): TypeTheme {
  return TYPE_THEME[type] ?? TYPE_THEME.other;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two colours: t=0 gives a, t=1 gives b. */
function mix(a: string, b: string, t: number) {
  const [ca, cb] = [channels(a), channels(b)];
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(", ")})`;
}

/** A policy folder's colours: the back and tab, the front, and text that stays readable on the tab. */
export function folderTones(type: string) {
  const t = themeFor(type);
  return { back: mix(t.tint, t.deep, 0.2), front: mix(t.tint, "#ffffff", 0.35), label: mix(t.deep, "#15171c", 0.35) };
}

/** The soft wash used in a folder's picture: a shade between the folder's tab and its ink. */
export function washTone(type: string) {
  const t = themeFor(type);
  return mix(t.tint, t.deep, 0.32);
}
