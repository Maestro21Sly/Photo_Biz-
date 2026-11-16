/**
 * Semantic colour tokens.
 *
 * Rules for this file:
 *  - It is the ONLY place a hex literal is allowed to appear in the app.
 *  - Every token is named for its job, not its hue, so dark mode is a value
 *    swap rather than a rewrite.
 *  - Text/background pairs are verified against WCAG AA (4.5:1 for body copy,
 *    3:1 for large text and non-text UI). `npm run check:contrast` — see
 *    scripts/check-contrast.mjs — asserts this and runs in CI-able isolation.
 *
 * Art direction: photography is the content, so surfaces stay quiet and a
 * single warm coral accent carries the energy. The accent splits into three
 * roles because one hue cannot be both vivid and AA-legible as small text:
 *   accent       — fills, icons, indicators (non-text / large-text contrast)
 *   accentText   — the same idea darkened until small text passes AA
 *   onAccent     — what sits on top of an accent fill
 */

export interface Colors {
  /* Surfaces, back to front */
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  /** Sheets, menus and toasts — reads as "lifted" in both schemes. */
  surfaceElevated: string;

  /* Ink */
  text: string;
  textMuted: string;
  textFaint: string;
  /** Ink on top of a photo or dark scrim. */
  textOnMedia: string;

  /* Lines */
  border: string;
  borderStrong: string;
  /**
   * Outlines that carry meaning rather than decoration — unchecked checkbox,
   * empty rating star, sheet grab handle. Held to the 3:1 non-text AA bar,
   * which `border` deliberately is not.
   */
  outline: string;
  /** Focus ring / keyboard navigation outline (web + external keyboards). */
  focus: string;

  /* Brand accent */
  accent: string;
  accentPressed: string;
  accentText: string;
  accentSoft: string;
  onAccent: string;
  onAccentSoft: string;

  /* Status */
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  warn: string;
  warnSoft: string;
  onWarnSoft: string;
  danger: string;
  dangerSoft: string;
  onDangerSoft: string;
  onDanger: string;

  /* Trust & ratings */
  verified: string;
  verifiedSoft: string;
  onVerifiedSoft: string;
  star: string;

  /* Media treatment */
  /** Behind an image while it loads — never white, so nothing flashes. */
  mediaPlaceholder: string;
  /** Full-screen viewer backdrop. */
  mediaBackdrop: string;
  /** Modal / sheet scrim. */
  scrim: string;
  /** Pill sitting on top of a photo (price tag, favourite button). */
  mediaChip: string;
  onMediaChip: string;
  /**
   * Gradient stops for the scrims that keep white chrome legible over an
   * unpredictable photo. Identical in both schemes on purpose — the photo
   * underneath doesn't get darker just because the OS is in dark mode.
   */
  scrimGradientStrong: string;
  scrimGradientSoft: string;
  /** Drop shadow behind text laid directly on an image. */
  mediaTextShadow: string;
  /** Inactive gallery page dot. */
  mediaDotIdle: string;
  /** Tint used for elevation shadows. */
  shadowTint: string;

  /* Skeletons */
  skeleton: string;
  skeletonHighlight: string;

  /* Chrome */
  tabBar: string;
  tabBarBorder: string;
  headerBg: string;
}

export const lightColors: Colors = {
  bg: "#FBFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F2EFE9",
  surfaceSunken: "#EAE5DC",
  surfaceElevated: "#FFFFFF",

  text: "#17130F",
  textMuted: "#5F5750",
  // Darker than it looks like it needs to be on white: this token also lands on
  // `surfaceMuted`, `accentSoft` and `mediaPlaceholder`, and the last of those
  // is the binding constraint (4.72:1). Measured against white alone it passed
  // while failing everywhere it actually renders.
  textFaint: "#6A635B",
  textOnMedia: "#FFFFFF",

  border: "#E6E0D7",
  borderStrong: "#D2CABE",
  outline: "#8E857A",
  focus: "#0B63CE",

  accent: "#D6391B",
  accentPressed: "#B02D13",
  accentText: "#BE3417",
  accentSoft: "#FCEBE6",
  onAccent: "#FFFFFF",
  onAccentSoft: "#9A2C13",

  success: "#0F6B55",
  successSoft: "#E2F2EC",
  onSuccessSoft: "#0C5744",
  warn: "#8A5300",
  warnSoft: "#FBF0DE",
  onWarnSoft: "#7A4900",
  danger: "#C2301C",
  dangerSoft: "#FBE9E5",
  onDangerSoft: "#9C2616",
  onDanger: "#FFFFFF",

  verified: "#0F6B55",
  verifiedSoft: "#E2F2EC",
  onVerifiedSoft: "#0C5744",
  star: "#B77800",

  mediaPlaceholder: "#EAE5DC",
  mediaBackdrop: "#0B0908",
  scrim: "rgba(15,12,9,0.5)",
  mediaChip: "rgba(20,16,13,0.72)",
  onMediaChip: "#FFFFFF",
  scrimGradientStrong: "rgba(0,0,0,0.55)",
  scrimGradientSoft: "rgba(0,0,0,0.45)",
  mediaTextShadow: "rgba(0,0,0,0.5)",
  mediaDotIdle: "rgba(255,255,255,0.55)",
  shadowTint: "#2A1E12",

  skeleton: "#ECE7DF",
  skeletonHighlight: "#F7F4EF",

  tabBar: "#FFFFFF",
  tabBarBorder: "#E6E0D7",
  headerBg: "#FBFAF7",
};

export const darkColors: Colors = {
  // Warm-neutral near-black rather than blue-black: photos read truer and the
  // coral accent doesn't turn muddy against it.
  bg: "#100E0D",
  surface: "#1A1715",
  surfaceMuted: "#252119",
  surfaceSunken: "#0A0908",
  surfaceElevated: "#221E1B",

  text: "#F7F3EE",
  textMuted: "#B5ADA3",
  textFaint: "#948B81",
  textOnMedia: "#FFFFFF",

  border: "#2E2925",
  borderStrong: "#463F39",
  // Lifted until it clears the 3:1 non-text bar against the *lightest* dark
  // surface it sits on (`surfaceMuted`), not just against the canvas — the
  // sheet grab handle renders on `surfaceElevated` and was failing at 2.93:1.
  outline: "#766E66",
  focus: "#7FB2FF",

  accent: "#FF7A5C",
  accentPressed: "#FF9478",
  accentText: "#FF8A6E",
  // Deepened from #3A2019: this is the lightest surface `textFaint` lands on
  // (the timestamp of an unread notification row), and at the old value that
  // pairing measured 4.48:1 — just under AA.
  accentSoft: "#331B15",
  // Dark ink on a light coral fill — the only combination that clears AA at
  // small sizes without dulling the accent into brown.
  onAccent: "#2B0F07",
  onAccentSoft: "#FFA48D",

  success: "#4CC7A3",
  successSoft: "#12332B",
  onSuccessSoft: "#66D6B5",
  warn: "#E6A94B",
  warnSoft: "#38290F",
  onWarnSoft: "#F0BC69",
  danger: "#FF7361",
  dangerSoft: "#3A1815",
  onDangerSoft: "#FF9385",
  onDanger: "#2B0B07",

  verified: "#4CC7A3",
  verifiedSoft: "#12332B",
  onVerifiedSoft: "#66D6B5",
  star: "#F2B93C",

  mediaPlaceholder: "#221E1B",
  mediaBackdrop: "#000000",
  scrim: "rgba(0,0,0,0.66)",
  mediaChip: "rgba(0,0,0,0.62)",
  onMediaChip: "#FFFFFF",
  scrimGradientStrong: "rgba(0,0,0,0.6)",
  scrimGradientSoft: "rgba(0,0,0,0.5)",
  mediaTextShadow: "rgba(0,0,0,0.6)",
  mediaDotIdle: "rgba(255,255,255,0.5)",
  shadowTint: "#000000",

  skeleton: "#252119",
  skeletonHighlight: "#302B25",

  tabBar: "#171412",
  tabBarBorder: "#2E2925",
  headerBg: "#100E0D",
};
