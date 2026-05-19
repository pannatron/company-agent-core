import type { Config } from "tailwindcss";

const ACCENT_COLORS = [
  "indigo",
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "teal",
  "fuchsia",
  "cyan",
  "pink",
  "orange",
] as const;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  /** Safelist all accent-related classes built from ACCENT_COLORS array */
  safelist: ACCENT_COLORS.flatMap((c) => [
    `ring-${c}-400/70`,
    `bg-${c}-500/15`,
    `text-${c}-200`,
    `border-${c}-500/40`,
    `bg-${c}-500`,
  ]),
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-dim": "rgb(var(--ink-dim) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgb(var(--border) / 1), 0 8px 24px -16px rgb(0 0 0 / 0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
