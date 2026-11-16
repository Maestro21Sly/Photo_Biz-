import React, { useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { Touchable } from "./ui";

/**
 * Layout primitives that make one codebase behave on three platforms.
 *
 * The recurring problems these solve:
 *  - **Notches and home indicators.** Screens opt into the edges they own
 *    instead of each one re-deriving insets by hand.
 *  - **Android navigation bars.** `insets.bottom` is non-zero for gesture
 *    navigation and for the 3-button bar; sticky footers must clear it.
 *  - **The web build.** A feed stretched across a 27" monitor is not a
 *    "responsive" app, it's a broken one. `contentWidth` caps and centres.
 */

/**
 * Caps and centres content. A no-op on phones, essential in a browser.
 * Memoised so it can sit in a style array without changing identity every
 * render — FlatList compares `contentContainerStyle` by reference.
 */
export function useContentWidth(max?: number): ViewStyle {
  const t = useTheme();
  const width = max ?? t.layout.contentMaxWidth;
  return useMemo<ViewStyle>(
    () => ({ width: "100%", maxWidth: width, alignSelf: "center" }),
    [width]
  );
}

/**
 * Themed props for a `RefreshControl`.
 *
 * Returned as a props object rather than a ready-made element on purpose:
 * Android's ScrollView `cloneElement`s whatever you pass to `refreshControl`
 * and injects `style`/`children` into it, so the element has to be a real
 * `RefreshControl` at the call site — a wrapper component would swallow them.
 *
 *   refreshControl={<RefreshControl {...useRefreshProps(isRefetching, refetch)} />}
 */
export function useRefreshProps(refreshing: boolean, onRefresh: () => void) {
  const t = useTheme();
  return useMemo(
    () => ({
      refreshing,
      onRefresh,
      // iOS reads `tintColor`; Android reads `colors` + the track colour.
      tintColor: t.colors.accent,
      colors: [t.colors.accent],
      progressBackgroundColor: t.colors.surface,
    }),
    [refreshing, onRefresh, t.colors.accent, t.colors.surface]
  );
}

export function Screen({
  children,
  /** Apply the top safe-area inset. Off when a header or hero handles it. */
  edgeTop = true,
  style,
}: {
  children: React.ReactNode;
  edgeTop?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: t.colors.bg },
        edgeTop ? { paddingTop: insets.top } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Keyboard-safe screen wrapper.
 *
 * iOS needs explicit padding because the keyboard floats over the view.
 * Android resizes the window itself (`adjustResize`), so adding padding there
 * double-counts and leaves a gap. Web has no software keyboard to dodge.
 */
export function KeyboardScreen({
  children,
  offset = 0,
  style,
}: {
  children: React.ReactNode;
  offset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={offset}
      style={[{ flex: 1, backgroundColor: t.colors.bg }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * The single header used by every pushed/modal screen, so back affordances,
 * title weight and safe-area padding never drift between routes.
 */
export function ScreenHeader({
  title,
  onBack,
  backIcon = "chevron-back",
  backLabel = "Go back",
  right,
  /** Hairline separator — off for screens that scroll under a transparent bar. */
  bordered = true,
  subtitle,
}: {
  title: string;
  onBack?: () => void;
  backIcon?: keyof typeof Ionicons.glyphMap;
  backLabel?: string;
  right?: React.ReactNode;
  bordered?: boolean;
  subtitle?: string;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + t.spacing.sm },
        bordered ? styles.headerBordered : null,
      ]}
    >
      <View style={styles.headerInner}>
        <View style={styles.side}>
          {onBack ? (
            <Touchable
              onPress={onBack}
              size={t.layout.touchTarget}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              style={styles.iconBtn}
            >
              <Ionicons name={backIcon} size={24} color={t.colors.text} />
            </Touchable>
          ) : null}
        </View>

        <View style={styles.titleWrap}>
          <Text
            style={styles.title}
            numberOfLines={1}
            accessibilityRole="header"
            maxFontSizeMultiplier={t.layout.maxFontScale}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={t.layout.maxFontScale}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Mirrors the left slot so the title stays optically centred. */}
        <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
      </View>
    </View>
  );
}

/**
 * Sticky bottom action bar. Pads for the home indicator / Android nav bar and
 * centres on wide screens so a browser doesn't get a 1400px-wide button row.
 */
export function StickyFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const width = useContentWidth();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + t.spacing.md }, style]}>
      <View style={[styles.footerInner, width]}>{children}</View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  header: { backgroundColor: t.colors.headerBg, paddingBottom: t.spacing.sm },
  headerBordered: { borderBottomWidth: 1, borderBottomColor: t.colors.border },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.sm,
    width: "100%",
    maxWidth: t.layout.contentMaxWidth,
    alignSelf: "center",
  },
  // Fixed width keeps the centred title honest whichever slot is populated.
  side: { width: t.layout.touchTarget, justifyContent: "center" },
  iconBtn: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: t.radius.pill,
  },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { ...t.type.h3, color: t.colors.text },
  subtitle: { ...t.type.small, color: t.colors.textMuted, marginTop: 1 },

  footer: {
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
  },
  footerInner: { flexDirection: "row", gap: t.spacing.md },
});
