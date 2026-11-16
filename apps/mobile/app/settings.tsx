import React, { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Divider, Field, Touchable } from "../src/components/ui";
import { KeyboardScreen, ScreenHeader, useContentWidth } from "../src/components/Screen";
import { useToast } from "../src/components/Toast";
import { useAuth } from "../src/lib/auth";
import { api, ApiError } from "../src/lib/api";
import { confirm } from "../src/lib/confirm";
import { haptics } from "../src/lib/haptics";
import { meetsPasswordLength, PASSWORD_LENGTH_HINT } from "../src/lib/passwordPolicy";
import { TERMS_URL, PRIVACY_URL } from "../src/lib/config";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function Settings() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { signOut } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleting, setDeleting] = useState(false);

  const changePassword = async () => {
    if (!meetsPasswordLength(next)) {
      setPwError(`New password must be ${PASSWORD_LENGTH_HINT.toLowerCase()}.`);
      haptics.warn();
      return;
    }
    setPwError(null);
    setSavingPw(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      haptics.success();
      toast("Password updated", "success");
    } catch (e) {
      haptics.error();
      const message = e instanceof ApiError ? e.message : "Couldn't update password";
      setPwError(message);
      toast(message, "error");
    } finally {
      setSavingPw(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletePw) {
      haptics.warn();
      toast("Enter your password to delete your account", "info");
      return;
    }
    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently erases your account, profile, bookings, and messages. It can't be undone.",
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api("/auth/me", { method: "DELETE", body: { password: deletePw } });
      toast("Account deleted", "success");
      await signOut();
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Sign out?",
      message: "You'll need your email and password to get back in.",
      confirmLabel: "Sign out",
    });
    if (ok) await signOut();
  };

  return (
    <KeyboardScreen>
      <ScreenHeader title="Settings" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.body, contentWidth, { paddingBottom: insets.bottom + 44 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section} accessibilityRole="header">
          Change password
        </Text>
        <Field
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          placeholder="Current password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Field
          label="New password"
          value={next}
          onChangeText={(v) => {
            setNext(v);
            setPwError(null);
          }}
          placeholder={PASSWORD_LENGTH_HINT}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={pwError ?? undefined}
        />
        <Button
          label="Update password"
          variant="secondary"
          onPress={changePassword}
          loading={savingPw}
          full
        />

        <Divider />
        <Text style={styles.section} accessibilityRole="header">
          Appearance
        </Text>
        <View style={styles.infoRow}>
          <Ionicons
            name={t.isDark ? "moon-outline" : "sunny-outline"}
            size={20}
            color={t.colors.textMuted}
          />
          <Text style={styles.infoText}>
            SnapCampus follows your device's {t.isDark ? "dark" : "light"} appearance setting.
            Change it in your system settings and the app follows immediately.
          </Text>
        </View>

        <Divider />
        <Text style={styles.section} accessibilityRole="header">
          Legal & support
        </Text>
        <LinkRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <LinkRow
          icon="lock-closed-outline"
          label="Privacy Policy"
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
        <LinkRow
          icon="help-circle-outline"
          label="Contact support"
          onPress={() => Linking.openURL("mailto:support@snapcampus.app")}
        />

        <Divider />
        <Button label="Sign out" variant="secondary" onPress={handleSignOut} full />

        <Divider />
        <Text style={[styles.section, { color: t.colors.danger }]} accessibilityRole="header">
          Danger zone
        </Text>
        <Text style={styles.dangerHint}>
          Permanently delete your account and all your data. This can't be undone.
        </Text>
        <Field
          label="Confirm password"
          value={deletePw}
          onChangeText={setDeletePw}
          placeholder="Your password"
          secureTextEntry
          textContentType="password"
        />
        <Button
          label="Delete account"
          variant="danger"
          onPress={confirmDelete}
          loading={deleting}
          accessibilityHint="Asks you to confirm before permanently deleting everything"
          full
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Touchable
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      pressedOpacity={0.75}
    >
      <Ionicons name={icon} size={20} color={t.colors.textMuted} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={t.colors.textFaint} />
    </Touchable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    body: { padding: t.spacing.xl, gap: t.spacing.md },
    section: { ...t.type.h3, color: t.colors.text, marginTop: t.spacing.sm },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.md,
      minHeight: 52,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    linkLabel: { ...t.type.body, color: t.colors.text, flex: 1, fontWeight: "600" },
    infoRow: {
      flexDirection: "row",
      gap: t.spacing.md,
      alignItems: "flex-start",
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    infoText: { ...t.type.small, color: t.colors.textMuted, flex: 1 },
    dangerHint: { ...t.type.small, color: t.colors.textMuted },
  });
