import React from "react";
import { StyleSheet, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { haptics } from "../lib/haptics";

export interface SheetAction {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

/**
 * Themed bottom action sheet.
 *
 * Replaces multi-button `Alert.alert` menus, which render nothing at all on
 * react-native-web. One implementation means the safety menu looks and behaves
 * the same on iOS, Android and in a browser, and it inherits dark mode for free
 * (the native iOS action sheet would not follow our palette anyway).
 */
export function ActionSheet({
  visible,
  title,
  message,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Without this the Android scrim stops at the status bar, leaving an
      // undimmed strip above a sheet that is supposed to own the screen.
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss menu"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + t.spacing.lg }]}>
        <View style={styles.handle} />
        {title ? (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                haptics.tap();
                onClose();
                // Let the sheet finish dismissing before the next dialog opens,
                // otherwise iOS drops the second modal presentation.
                setTimeout(a.onPress, 220);
              }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
            >
              {a.icon ? (
                <Ionicons
                  name={a.icon}
                  size={20}
                  color={a.destructive ? t.colors.danger : t.colors.text}
                />
              ) : null}
              <Text style={[styles.actionLabel, a.destructive && { color: t.colors.danger }]}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: t.colors.scrim },
  sheet: {
    backgroundColor: t.colors.surfaceElevated,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.md,
    gap: t.spacing.sm,
    width: "100%",
    maxWidth: t.layout.sheetMaxWidth,
    alignSelf: "center",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.outline,
    marginBottom: t.spacing.sm,
  },
  title: { ...t.type.h3, color: t.colors.text, textAlign: "center" },
  message: { ...t.type.small, color: t.colors.textMuted, textAlign: "center" },
  actions: { marginTop: t.spacing.sm, gap: t.spacing.xs },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.md,
    minHeight: 52,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceMuted,
  },
  actionLabel: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700" },
  cancel: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: t.spacing.xs,
  },
  cancelLabel: { ...t.type.bodyStrong, color: t.colors.textMuted, fontWeight: "700" },
});
