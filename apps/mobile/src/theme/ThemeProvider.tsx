import React, { createContext, useContext, useEffect, useMemo } from "react";
import { Platform, useColorScheme } from "react-native";
import { darkColors, lightColors, type Colors } from "./colors";
import { aspect, duration, layout, radius, spacing, typography } from "./tokens";

export interface Shadows {
  /** Cards and list rows. */
  card: object;
  /** Sheets, toasts, sticky CTAs — anything that floats over content. */
  floating: object;
}

export interface Theme {
  scheme: "light" | "dark";
  isDark: boolean;
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typography;
  duration: typeof duration;
  layout: typeof layout;
  aspect: typeof aspect;
  shadow: Shadows;
}

/**
 * Elevation reads differently per scheme. On light surfaces a soft warm drop
 * shadow does the work; on a near-black canvas a shadow is invisible, so dark
 * mode leans on a lighter surface colour plus a hairline border and keeps only
 * enough shadow for Android's elevation API to separate layers.
 */
function shadowsFor(colors: Colors, isDark: boolean): Shadows {
  if (isDark) {
    return {
      card: {
        shadowColor: colors.shadowTint,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      },
      floating: {
        shadowColor: colors.shadowTint,
        shadowOpacity: 0.55,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      },
    };
  }
  return {
    card: {
      shadowColor: colors.shadowTint,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    floating: {
      shadowColor: colors.shadowTint,
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
  };
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `useColorScheme` is backed by matchMedia on web and by the OS trait on
  // native, so one hook covers all three platforms.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const isDark = scheme === "dark";

  const value = useMemo<Theme>(() => {
    const colors = isDark ? darkColors : lightColors;
    return {
      scheme,
      isDark,
      colors,
      spacing,
      radius,
      type: typography,
      duration,
      layout,
      aspect,
      shadow: shadowsFor(colors, isDark),
    };
  }, [scheme, isDark]);

  // Web only: paint the document itself so rubber-band overscroll and the
  // area outside the SPA root match the theme instead of flashing white.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const bg = value.colors.bg;
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    // Tells the browser to render native form controls / scrollbars correctly.
    document.documentElement.style.colorScheme = scheme;
  }, [scheme, value.colors.bg]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

// Stylesheets are cached per (factory, scheme). Factories are module-level
// constants, so in practice each screen builds at most two stylesheets for the
// life of the process — no per-render StyleSheet.create, which matters for the
// 60fps lists.
const styleCache = new WeakMap<object, Map<string, unknown>>();

/**
 * Themed stylesheets.
 *
 * The factory calls `StyleSheet.create` itself:
 *
 *   const makeStyles = (t: Theme) =>
 *     StyleSheet.create({ card: { backgroundColor: t.colors.surface } });
 *   ...
 *   const styles = useThemedStyles(makeStyles);
 *
 * Keeping `create` inside the factory is what preserves TypeScript's
 * contextual typing — `flexDirection: "row"` narrows to the literal instead of
 * widening to `string`, so no call site needs `as const`. This hook's only job
 * is to run the factory once per colour scheme and remember the result.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    let perScheme = styleCache.get(factory);
    if (!perScheme) {
      perScheme = new Map();
      styleCache.set(factory, perScheme);
    }
    const cached = perScheme.get(theme.scheme);
    if (cached) return cached as T;
    const created = factory(theme);
    perScheme.set(theme.scheme, created);
    return created;
  }, [factory, theme]);
}
