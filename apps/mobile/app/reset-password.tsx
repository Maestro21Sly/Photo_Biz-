import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Field } from "../src/components/ui";
import { KeyboardScreen, useContentWidth } from "../src/components/Screen";
import { useToast } from "../src/components/Toast";
import { api, ApiError } from "../src/lib/api";
import { haptics } from "../src/lib/haptics";
import { meetsPasswordLength, PASSWORD_LENGTH_HINT } from "../src/lib/passwordPolicy";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function ResetPassword() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth(420);
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!token) {
      toast("This reset link is invalid", "error");
      return;
    }
    if (!meetsPasswordLength(password)) {
      setError(`Password must be ${PASSWORD_LENGTH_HINT.toLowerCase()}.`);
      haptics.warn();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: { token, newPassword: password },
      });
      setDone(true);
      haptics.success();
      toast("Password updated — please sign in", "success");
    } catch (e) {
      haptics.error();
      const message = e instanceof ApiError ? e.message : "Couldn't reset password";
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardScreen>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          contentWidth,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 44 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.logoDot} />
          <Text style={styles.wordmark}>SnapCampus</Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {done ? "You're all set" : "Choose a new password"}
        </Text>

        {done ? (
          <>
            <View style={styles.successRow}>
              <Ionicons name="checkmark-circle" size={22} color={t.colors.success} />
              <Text style={styles.subtitle}>Your password has been updated.</Text>
            </View>
            <Button label="Back to sign in" onPress={() => router.replace("/(auth)/sign-in")} full />
          </>
        ) : !token ? (
          <>
            <Text style={styles.subtitle}>
              This reset link is missing or invalid. Request a new one from the sign-in screen.
            </Text>
            <Button
              label="Back to sign in"
              variant="secondary"
              onPress={() => router.replace("/(auth)/sign-in")}
              full
            />
          </>
        ) : (
          <>
            <Field
              label="New password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              placeholder={PASSWORD_LENGTH_HINT}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              error={error ?? undefined}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Button label="Reset password" onPress={submit} loading={loading} full />
          </>
        )}
      </ScrollView>
    </KeyboardScreen>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { paddingHorizontal: t.spacing.xl, gap: t.spacing.lg },
    brand: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
    logoDot: { width: 22, height: 22, borderRadius: 7, backgroundColor: t.colors.accent },
    wordmark: { ...t.type.h2, color: t.colors.text, fontWeight: "800" },
    title: { ...t.type.title, color: t.colors.text, marginTop: t.spacing.lg },
    subtitle: { ...t.type.body, color: t.colors.textMuted, flex: 1 },
    successRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
  });
