import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, AccessibilityInfo, Animated, Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { useReducedMotion } from "../lib/a11y";

type ToastKind = "success" | "error" | "info";
interface ToastState {
  message: string;
  kind: ToastKind;
  /** Distinguishes back-to-back identical messages so the animation restarts. */
  seq: number;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

const VISIBLE_MS = 2800;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    setToast({ message, kind, seq: ++seq.current });
    // Toasts are visual-only for a screen-reader user, so mirror them into the
    // accessibility announcement queue.
    AccessibilityInfo.announceForAccessibility?.(message);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <ToastView
          key={toast.seq}
          toast={toast}
          bottomInset={insets.bottom}
          opacity={opacity}
          translateY={translateY}
          onHidden={() => setToast(null)}
          timerRef={timer}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  bottomInset,
  opacity,
  translateY,
  onHidden,
  timerRef,
}: {
  toast: ToastState;
  bottomInset: number;
  opacity: Animated.Value;
  translateY: Animated.Value;
  onHidden: () => void;
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const enter = reduceMotion
      ? Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      : Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: t.duration.base, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }),
        ]);

    opacity.setValue(0);
    translateY.setValue(reduceMotion ? 0 : 16);
    enter.start();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: reduceMotion ? 0 : t.duration.fast,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: reduceMotion ? 0 : 16,
          duration: reduceMotion ? 0 : t.duration.fast,
          useNativeDriver: true,
        }),
      ]).start(onHidden);
    }, VISIBLE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.seq, reduceMotion, opacity, translateY, onHidden, timerRef, t.duration]);

  const icon =
    toast.kind === "success" ? "checkmark-circle" : toast.kind === "error" ? "alert-circle" : "information-circle";
  const tint =
    toast.kind === "success" ? t.colors.success : toast.kind === "error" ? t.colors.danger : t.colors.accent;

  return (
    <Animated.View
      // Non-interactive, and already announced above — hidden from the a11y tree
      // so it can't steal focus mid-task.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.wrap,
        // Clears the tab bar plus the home indicator / Android nav bar.
        { bottom: bottomInset + 78, opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.toast}>
        <Ionicons name={icon} size={20} color={tint} />
        <Text style={styles.text} numberOfLines={3}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  wrap: {
    position: "absolute",
    left: t.spacing.lg,
    right: t.spacing.lg,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    maxWidth: 440,
    ...t.shadow.floating,
    ...(Platform.OS === "web" ? { position: "relative" as const } : null),
  },
  text: { ...t.type.small, color: t.colors.text, fontWeight: "600", flexShrink: 1 },
});
