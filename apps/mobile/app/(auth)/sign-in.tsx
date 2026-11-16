import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, Touchable } from "../../src/components/ui";
import { KeyboardScreen, useContentWidth } from "../../src/components/Screen";
import { useToast } from "../../src/components/Toast";
import { useAuth } from "../../src/lib/auth";
import { api, ApiError } from "../../src/lib/api";
import { haptics } from "../../src/lib/haptics";
import { useThemedStyles, type Theme } from "../../src/theme";

// Demo credentials are only prefilled in development builds.
const DEV = typeof __DEV__ !== "undefined" && __DEV__;

export default function SignIn() {
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth(420);
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const toast = useToast();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState(DEV ? "student@snapcampus.app" : "");
  const [password, setPassword] = useState(DEV ? "password12345" : "");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleForgot = async () => {
    if (!email.trim()) {
      setError("Enter your email first, then tap Forgot password.");
      haptics.warn();
      return;
    }
    setError(null);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: { email: email.trim() },
      });
    } catch {
      /* ignore — the response below is deliberately generic either way */
    }
    toast("If that email exists, we sent reset instructions.", "info");
  };

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password to sign in.");
      haptics.warn();
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      haptics.success();
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError ? e.message : "Couldn't sign in");
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
          Find your campus{"\n"}photographer.
        </Text>
        <Text style={styles.subtitle}>
          Compare styles, prices, and reviews — then book in a few taps.
        </Text>

        <View style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@school.edu"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            submitBehavior="submit"
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!showPw}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <View style={styles.pwRow}>
            <Touchable
              onPress={() => setShowPw((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPw ? "Hide password" : "Show password"}
              accessibilityState={{ selected: showPw }}
              style={styles.textBtn}
            >
              <Text style={styles.link}>{showPw ? "Hide password" : "Show password"}</Text>
            </Touchable>
            <Touchable
              onPress={handleForgot}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              accessibilityHint="Emails you a reset link"
              style={styles.textBtn}
            >
              <Text style={styles.link}>Forgot password?</Text>
            </Touchable>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Button label="Sign in" onPress={submit} loading={loading} full />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New here?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <Touchable accessibilityRole="link" accessibilityLabel="Create an account" style={styles.textBtn}>
              <Text style={styles.linkStrong}>Create an account</Text>
            </Touchable>
          </Link>
        </View>

        {DEV ? (
          <Text style={styles.demoHint}>
            Demo: student@snapcampus.app · maya@snapcampus.app — password “password12345”.
          </Text>
        ) : null}
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
    title: { ...t.type.display, color: t.colors.text, marginTop: t.spacing["2xl"] },
    subtitle: { ...t.type.body, color: t.colors.textMuted, maxWidth: 340 },
    form: { gap: t.spacing.md, marginTop: t.spacing.lg },
    pwRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: t.spacing.sm,
    },
    // Text links still need a 44pt target.
    textBtn: { minHeight: t.layout.touchTarget, justifyContent: "center" },
    link: { ...t.type.small, color: t.colors.accentText, fontWeight: "600" },
    linkStrong: { ...t.type.bodyStrong, color: t.colors.accentText, fontWeight: "700" },
    error: { ...t.type.small, color: t.colors.danger },
    footer: {
      flexDirection: "row",
      gap: t.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      marginTop: t.spacing.md,
    },
    footerText: { ...t.type.body, color: t.colors.textMuted },
    demoHint: {
      ...t.type.small,
      color: t.colors.textFaint,
      textAlign: "center",
      marginTop: t.spacing.lg,
    },
  });
