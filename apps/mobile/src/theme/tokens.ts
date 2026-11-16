/**
 * Primitive design tokens — everything here is scheme-independent.
 *
 * Colours live in ./colors.ts because they are the only tokens that flip
 * between light and dark. Keeping the two apart means a screen can pull
 * spacing/type/radii statically while colours come from the theme context.
 */

/** 4pt base grid. Named rather than numeric so intent survives refactors. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 44,
  "5xl": 64,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Type scale. Sizes are unscaled on purpose — React Native multiplies them by
 * the OS font-scale setting, which is how Dynamic Type reaches us. Components
 * that live in fixed-height chrome cap that multiplier via `maxFontScale`
 * below rather than opting out of scaling entirely.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.5 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3 },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.2 },
} as const;

/** Motion. All of these are bypassed when "reduce motion" is on — see lib/a11y. */
export const duration = {
  instant: 90,
  fast: 150,
  base: 220,
  slow: 340,
} as const;

export const layout = {
  /** Apple HIG / Material minimum tappable size. Enforced by `Touchable`. */
  touchTarget: 44,
  /** Feeds get uncomfortable to read past this on a desktop browser. */
  contentMaxWidth: 640,
  /** Bottom sheets and modals on wide screens. */
  sheetMaxWidth: 520,
  /**
   * Ceiling for Dynamic Type inside fixed-height chrome (tab bars, badges,
   * pills). Body copy is deliberately left uncapped.
   */
  maxFontScale: 1.4,
  /** Tighter cap for numeric badges, which have no room to grow at all. */
  maxFontScaleTight: 1.2,
} as const;

/** Standard portrait crop for portfolio work. Keeps galleries from reflowing. */
export const aspect = {
  hero: 4 / 3,
  portrait: 4 / 5,
  square: 1,
  wide: 16 / 9,
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type TypeScale = typeof typography;
