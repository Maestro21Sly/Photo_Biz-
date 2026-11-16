import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../src/components/ui";
import { useContentWidth } from "../src/components/Screen";
import { api } from "../src/lib/api";
import { haptics } from "../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

export default function VerifyEmail() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth(420);
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    if (!token) {
      setState("fail");
      return;
    }
    api("/auth/verify-email", { method: "POST", auth: false, body: { token } })
      .then(() => {
        setState("ok");
        haptics.success();
      })
      .catch(() => {
        setState("fail");
        haptics.error();
      });
  }, [token]);

  const ok = state === "ok";

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.container, contentWidth]}>
        {state === "loading" ? (
          <>
            <ActivityIndicator color={t.colors.accent} size="large" />
            <Text style={styles.subtitle}>Confirming your email…</Text>
          </>
        ) : (
          <>
            <View style={[styles.iconWrap, { backgroundColor: ok ? t.colors.successSoft : t.colors.dangerSoft }]}>
              <Ionicons
                name={ok ? "checkmark-circle" : "alert-circle"}
                size={40}
                color={ok ? t.colors.onSuccessSoft : t.colors.onDangerSoft}
              />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {ok ? "Email verified" : "Link expired"}
            </Text>
            <Text style={styles.subtitle}>
              {ok
                ? "Thanks — your email is confirmed."
                : "This verification link is invalid or has expired. You can request a new one from your profile."}
            </Text>
            <Button label="Continue" onPress={() => router.replace("/(tabs)")} full />
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.colors.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: t.spacing.xl,
    },
    container: { alignItems: "center", gap: t.spacing.md },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: t.spacing.sm,
    },
    title: { ...t.type.title, color: t.colors.text, textAlign: "center" },
    subtitle: {
      ...t.type.body,
      color: t.colors.textMuted,
      textAlign: "center",
      maxWidth: 320,
      marginBottom: t.spacing.md,
    },
  });
