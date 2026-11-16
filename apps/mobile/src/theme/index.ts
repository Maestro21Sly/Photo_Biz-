/**
 * SnapCampus design system — public entry point.
 *
 *   import { useTheme, useThemedStyles, spacing, radius } from "@/theme";
 *
 * Colours always come from `useTheme()` (they flip with the OS scheme);
 * spacing / radii / typography / motion can be imported statically.
 */
// `typography` rather than `type`: `import { type ... }` is ambiguous with
// TypeScript's type-only import modifier. Inside the theme object it stays
// `theme.type`, which reads better at the ~500 call sites that use it.
export { spacing, radius, typography, duration, layout, aspect } from "./tokens";
export type { Colors } from "./colors";
export { lightColors, darkColors } from "./colors";
export {
  ThemeProvider,
  useTheme,
  useThemedStyles,
  type Theme,
  type Shadows,
} from "./ThemeProvider";
