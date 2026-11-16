import React, { memo, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { useReducedMotion } from "../lib/a11y";
import { haptics } from "../lib/haptics";
import { SmartImage } from "./SmartImage";

/* ------------------------------------------------------------- Touchable -- */

/**
 * Base pressable for the whole app.
 *
 * Why it exists: `hitSlop` is the only reliable way to give a visually small
 * control (a 24px icon, a heart on a photo) a 44pt target on every platform,
 * and getting that right by hand at 40+ call sites does not happen. `Touchable`
 * measures the declared size and pads the difference automatically.
 */
export function Touchable({
  children,
  style,
  /** Visual size of the control; drives automatic hit-slop. */
  size,
  pressedOpacity = 0.65,
  scaleOnPress = false,
  ...props
}: PressableProps & {
  style?: StyleProp<ViewStyle>;
  size?: number;
  pressedOpacity?: number;
  scaleOnPress?: boolean;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const slop =
    size != null && size < t.layout.touchTarget
      ? Math.ceil((t.layout.touchTarget - size) / 2)
      : undefined;

  return (
    <Pressable
      hitSlop={slop}
      style={(state) => [
        style,
        state.pressed ? { opacity: pressedOpacity } : null,
        // A scale nudge is motion; skip it when the user asked for less.
        state.pressed && scaleOnPress && !reduceMotion ? { transform: [{ scale: 0.97 }] } : null,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Button -- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  style,
  full,
  accessibilityHint,
  /**
   * Haptic fired before `onPress`. Defaults on for the two variants that
   * represent a commitment; secondary/ghost buttons stay silent so feedback
   * keeps meaning something.
   */
  haptic,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityHint?: string;
  haptic?: "tap" | "press" | "selection" | false;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isDisabled = Boolean(disabled || loading);
  const onDark = variant === "primary" || variant === "danger";
  const defaultHaptic = onDark ? ("tap" as const) : false;
  const chosen = haptic === undefined ? defaultHaptic : haptic;

  const handle = () => {
    if (chosen) haptics[chosen]();
    onPress?.();
  };

  return (
    <Touchable
      onPress={handle}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      scaleOnPress
      pressedOpacity={0.88}
      style={[
        styles.btnBase,
        size === "sm" && styles.btnSm,
        variant === "primary" && styles.btnPrimary,
        variant === "secondary" && styles.btnSecondary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        full ? { alignSelf: "stretch" } : null,
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={onDark ? t.colors.onAccent : t.colors.text} />
      ) : (
        <View style={styles.btnInner}>
          {icon}
          <Text
            style={[styles.btnLabel, onDark && { color: t.colors.onAccent }]}
            numberOfLines={2}
            // Buttons can grow, but a 3x label in a two-up row would clip the
            // sibling; the cap keeps large-type layouts intact.
            maxFontSizeMultiplier={t.layout.maxFontScale}
          >
            {label}
          </Text>
        </View>
      )}
    </Touchable>
  );
}

/* ---------------------------------------------------------------- Avatar -- */

export const Avatar = memo(function Avatar({
  name,
  uri,
  size = 48,
  /** Draws a ring in the surface colour — for avatars overlapping imagery. */
  ring,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const t = useTheme();
  const initials = useMemo(
    () =>
      name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?",
    [name]
  );

  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    ...(ring ? { borderWidth: 2, borderColor: t.colors.surface } : null),
  };

  if (uri) {
    return (
      <SmartImage
        uri={uri}
        style={frame}
        borderRadius={size / 2}
        contentFit="cover"
        accessibilityLabel={`${name}'s profile photo`}
      />
    );
  }

  return (
    <View
      style={[frame, { alignItems: "center", justifyContent: "center", backgroundColor: t.colors.accentSoft }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}'s profile, no photo`}
    >
      <Text
        allowFontScaling={false}
        style={{ color: t.colors.onAccentSoft, fontWeight: "800", fontSize: size * 0.36 }}
      >
        {initials}
      </Text>
    </View>
  );
});

/* ------------------------------------------------------------------ Chip -- */

export function Chip({
  label,
  active,
  onPress,
  accessibilityHint,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Touchable
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: Boolean(active) }}
      pressedOpacity={0.7}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text
        style={[styles.chipLabel, active && { color: t.colors.onAccent }]}
        maxFontSizeMultiplier={t.layout.maxFontScale}
      >
        {label}
      </Text>
    </Touchable>
  );
}

/* ---------------------------------------------------------------- Badges -- */

export function VerifiedBadge() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.verified} accessible accessibilityLabel="Verified photographer">
      <Ionicons name="checkmark-circle" size={12} color={t.colors.onVerifiedSoft} />
      <Text style={styles.verifiedText} maxFontSizeMultiplier={t.layout.maxFontScaleTight}>
        Verified
      </Text>
    </View>
  );
}

export function RatingPill({ average, count }: { average: number; count: number }) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (count === 0) {
    return (
      <Text
        style={styles.newBadge}
        maxFontSizeMultiplier={t.layout.maxFontScaleTight}
        accessibilityLabel="New photographer, no reviews yet"
      >
        New
      </Text>
    );
  }
  return (
    <View
      style={styles.ratingPill}
      accessible
      accessibilityLabel={`Rated ${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}`}
    >
      <Ionicons name="star" size={12} color={t.colors.star} />
      <Text style={styles.ratingValue} maxFontSizeMultiplier={t.layout.maxFontScaleTight}>
        {average.toFixed(1)}
      </Text>
      <Text style={styles.ratingCount} maxFontSizeMultiplier={t.layout.maxFontScaleTight}>
        ({count})
      </Text>
    </View>
  );
}

export function Tag({ label }: { label: string }) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText} maxFontSizeMultiplier={t.layout.maxFontScale}>
        {label}
      </Text>
    </View>
  );
}

/** Coloured status pill — booking states share one implementation. */
export function StatusPill({ tone, label }: { tone: "neutral" | "pending" | "ok" | "bad"; label: string }) {
  const t = useTheme();
  const map = {
    neutral: { bg: t.colors.surfaceMuted, fg: t.colors.textMuted },
    pending: { bg: t.colors.warnSoft, fg: t.colors.onWarnSoft },
    ok: { bg: t.colors.successSoft, fg: t.colors.onSuccessSoft },
    bad: { bg: t.colors.dangerSoft, fg: t.colors.onDangerSoft },
  } as const;
  const c = map[tone];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        paddingHorizontal: t.spacing.md,
        paddingVertical: 5,
        borderRadius: t.radius.pill,
      }}
    >
      <Text
        style={{ ...t.type.caption, color: c.fg, fontWeight: "700" }}
        maxFontSizeMultiplier={t.layout.maxFontScale}
      >
        {label}
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------------- Field -- */

/** Forwards its ref so forms can chain focus from one field to the next. */
export const Field = React.forwardRef<
  TextInput,
  TextInputProps & { label?: string; error?: string; hint?: string }
>(function Field({ label, error, hint, style, ...props }, ref) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={{ gap: t.spacing.xs }}>
      {label ? (
        <Text style={styles.fieldLabel} maxFontSizeMultiplier={t.layout.maxFontScale}>
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={t.colors.textFaint}
        // The visible label is a sibling, not a wrapper, so screen readers need
        // it restated here — otherwise the field announces only its value.
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={props.accessibilityHint ?? hint}
        // Ensures the caret and native selection UI flip with the theme.
        selectionColor={t.colors.accent}
        keyboardAppearance={t.isDark ? "dark" : "light"}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {hint && !error ? (
        <Text style={styles.fieldHint} maxFontSizeMultiplier={t.layout.maxFontScale}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text
          style={styles.fieldError}
          // Announced as soon as it appears rather than only on focus.
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={t.layout.maxFontScale}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------- Misc bits -- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.divider, style]} accessibilityRole="none" />;
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={[styles.sectionTitle, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/* --------------------------------------------------------- Empty / Error -- */

/**
 * Empty states are a product surface, not a shrug: each one names what is
 * missing and offers the single action that fixes it.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stateWrap} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={26} color={t.colors.accent} />
      </View>
      <Text style={styles.stateTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.stateText}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} style={{ marginTop: t.spacing.sm }} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  onRetry,
  message,
  title = "Something went wrong",
}: {
  onRetry?: () => void;
  message?: string;
  title?: string;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stateWrap} accessibilityLiveRegion="polite">
      <View style={[styles.stateIcon, { backgroundColor: t.colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={26} color={t.colors.onDangerSoft} />
      </View>
      <Text style={styles.stateTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.stateText}>
        {message ?? "We couldn't load this. Check your connection and try again."}
      </Text>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          onPress={onRetry}
          accessibilityHint="Reloads this screen"
          style={{ marginTop: t.spacing.sm }}
        />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- Skeleton -- */

/**
 * Pulsing placeholder. One `Animated.Value` per instance is acceptable here
 * because skeletons only exist for the first paint and are unmounted the
 * moment data lands — they never coexist with a scrolling list.
 */
export function Skeleton({
  height = 16,
  width = "100%",
  radius,
  style,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: 700, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  const backgroundColor = reduceMotion
    ? t.colors.skeleton
    : progress.interpolate({
        inputRange: [0, 1],
        outputRange: [t.colors.skeleton, t.colors.skeletonHighlight],
      });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height, width: width as ViewStyle["width"], borderRadius: radius ?? t.radius.sm, backgroundColor },
        style,
      ]}
    />
  );
}

/**
 * Mirrors `PhotographerCard` geometry exactly — hero at the same aspect ratio,
 * same strip height, same body padding — so the swap from skeleton to content
 * does not move a single pixel.
 */
export function SkeletonCard() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.skelCard} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton height={undefined} style={{ aspectRatio: t.aspect.hero, width: "100%" }} radius={0} />
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={76} style={{ flex: 1 }} radius={0} />
        ))}
      </View>
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
          <Skeleton height={40} width={40} radius={20} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={14} width="55%" />
            <Skeleton height={11} width="40%" />
          </View>
        </View>
        <Skeleton height={12} width="90%" />
        <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
          <Skeleton height={26} width={78} radius={t.radius.pill} />
          <Skeleton height={26} width={62} radius={t.radius.pill} />
        </View>
      </View>
    </View>
  );
}

/** Matches the message / notification row: avatar, two lines, trailing meta. */
export function SkeletonRow({ avatarSize = 52 }: { avatarSize?: number }) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md, paddingVertical: t.spacing.md }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Skeleton height={avatarSize} width={avatarSize} radius={avatarSize / 2} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton height={14} width="45%" />
        <Skeleton height={11} width="75%" />
      </View>
    </View>
  );
}

/** Matches the booking card: identity row, meta row, action button. */
export function SkeletonBookingCard() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.skelPlain} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
        <Skeleton height={44} width={44} radius={22} />
        <View style={{ flex: 1, gap: 7 }}>
          <Skeleton height={15} width="55%" />
          <Skeleton height={11} width="70%" />
        </View>
        <Skeleton height={24} width={72} radius={t.radius.pill} />
      </View>
      <Skeleton height={12} width="60%" />
      <Skeleton height={48} width="100%" radius={t.radius.pill} />
    </View>
  );
}

/* ------------------------------------------------------------------------ */

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  // `minHeight` rather than `height` throughout: at a 200% font scale a fixed
  // height clips the label instead of growing with it.
  btnBase: {
    minHeight: 52,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: t.spacing.xl,
  },
  btnSm: { minHeight: t.layout.touchTarget, paddingHorizontal: t.spacing.lg },
  btnInner: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
  btnPrimary: { backgroundColor: t.colors.accent },
  btnSecondary: { backgroundColor: t.colors.surfaceMuted },
  btnGhost: { backgroundColor: "transparent" },
  btnDanger: { backgroundColor: t.colors.danger },
  btnLabel: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700", textAlign: "center" },

  chip: {
    paddingHorizontal: t.spacing.lg,
    minHeight: 38,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    // `surfaceMuted`, not `surface`: these chips live inside bottom sheets,
    // and in light mode `surface` and `surfaceElevated` are both pure white —
    // an unselected chip vanished into the sheet with only a 1.3:1 hairline
    // holding it. Muted reads as an unselected segment on every surface.
    backgroundColor: t.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  chipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  chipLabel: { ...t.type.small, color: t.colors.text, fontWeight: "600" },

  verified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: t.colors.verifiedSoft,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
  },
  verifiedText: { color: t.colors.onVerifiedSoft, fontWeight: "700", fontSize: 11 },

  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingValue: { ...t.type.smallStrong, color: t.colors.text },
  ratingCount: { ...t.type.small, color: t.colors.textFaint },
  newBadge: {
    ...t.type.caption,
    color: t.colors.onAccentSoft,
    backgroundColor: t.colors.accentSoft,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 3,
    borderRadius: t.radius.pill,
    overflow: "hidden",
  },

  tag: {
    backgroundColor: t.colors.surfaceMuted,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
  },
  tagText: { ...t.type.small, color: t.colors.textMuted, fontWeight: "600" },

  fieldLabel: { ...t.type.small, color: t.colors.textMuted, fontWeight: "600", marginLeft: 2 },
  fieldHint: { ...t.type.small, color: t.colors.textFaint, marginLeft: 2 },
  fieldError: { ...t.type.small, color: t.colors.danger, marginLeft: 2 },
  input: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    minHeight: 52,
    ...t.type.body,
    color: t.colors.text,
    // Removes the browser's default focus ring so ours is the only one.
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  inputError: { borderColor: t.colors.danger, borderWidth: 1.5 },

  divider: { height: 1, backgroundColor: t.colors.border, marginVertical: t.spacing.lg },
  sectionTitle: { ...t.type.h3, color: t.colors.text, marginBottom: t.spacing.md },

  stateWrap: {
    alignItems: "center",
    paddingVertical: t.spacing["4xl"],
    paddingHorizontal: t.spacing.xl,
    gap: t.spacing.sm,
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: t.spacing.xs,
  },
  stateTitle: { ...t.type.h3, color: t.colors.text, textAlign: "center" },
  stateText: { ...t.type.body, color: t.colors.textMuted, textAlign: "center", maxWidth: 300 },

  skelCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  skelPlain: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
    gap: t.spacing.md,
  },
});
