import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Field, Touchable } from "../../src/components/ui";
import { KeyboardScreen, useContentWidth } from "../../src/components/Screen";
import { useAuth } from "../../src/lib/auth";
import { ApiError } from "../../src/lib/api";
import { haptics } from "../../src/lib/haptics";
import { meetsPasswordLength, PASSWORD_LENGTH_HINT } from "../../src/lib/passwordPolicy";
import type { Role } from "../../src/types";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

export default function SignUp() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth(460);
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");
  const [accepted, setAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);

    // Validate locally first so the user sees which field is wrong rather than
    // a single generic message from the server.
    const next: typeof fieldErrors = {};
    if (!displayName.trim()) next.name = "We need a name to show photographers.";
    if (!email.trim()) next.email = "Enter your email address.";
    if (!meetsPasswordLength(password)) next.password = `Use ${PASSWORD_LENGTH_HINT.toLowerCase()}.`;
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      haptics.warn();
      return;
    }
    if (!accepted) {
      setError("Please accept the Terms & Privacy Policy to continue.");
      haptics.warn();
      return;
    }

    setLoading(true);
    try {
      await signUp({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        role,
        acceptedTerms: true,
      });
      haptics.success();
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError ? e.message : "Couldn't create account");
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
          { paddingTop: insets.top + t.spacing.xl, paddingBottom: insets.bottom + 44 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">
          Create your account
        </Text>
        <Text style={styles.subtitle}>
          Join as a student looking to book, or a photographer ready to get discovered.
        </Text>

        <View style={styles.roleRow} accessibilityRole="radiogroup">
          <RoleCard
            title="I'm a student"
            desc="Find & book photographers"
            active={role === "STUDENT"}
            onPress={() => {
              haptics.selection();
              setRole("STUDENT");
            }}
          />
          <RoleCard
            title="I'm a photographer"
            desc="List my work & get booked"
            active={role === "PHOTOGRAPHER"}
            onPress={() => {
              haptics.selection();
              setRole("PHOTOGRAPHER");
            }}
          />
        </View>

        <View style={styles.form}>
          <Field
            label="Name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            error={fieldErrors.name}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
          />
          <Field
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@school.edu"
            error={fieldErrors.email}
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
            placeholder={PASSWORD_LENGTH_HINT}
            hint={`${PASSWORD_LENGTH_HINT}.`}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Touchable
            style={styles.tosRow}
            onPress={() => {
              haptics.selection();
              setAccepted((a) => !a);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
              {accepted ? <Ionicons name="checkmark" size={15} color={t.colors.onAccent} /> : null}
            </View>
            <Text style={styles.tosText}>
              I agree to the Terms of Service and Privacy Policy.
            </Text>
          </Touchable>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Button label="Create account" onPress={submit} loading={loading} full />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Touchable accessibilityRole="link" accessibilityLabel="Sign in" style={styles.textBtn}>
              <Text style={styles.link}>Sign in</Text>
            </Touchable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardScreen>
  );
}

function RoleCard({
  title,
  desc,
  active,
  onPress,
}: {
  title: string;
  desc: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Touchable
      onPress={onPress}
      style={[styles.roleCard, active && styles.roleCardActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}. ${desc}`}
      pressedOpacity={0.8}
    >
      <View style={styles.roleTop}>
        <Text style={[styles.roleTitle, active && { color: t.colors.onAccentSoft }]}>{title}</Text>
        {active ? <Ionicons name="checkmark-circle" size={18} color={t.colors.accent} /> : null}
      </View>
      <Text style={styles.roleDesc}>{desc}</Text>
    </Touchable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { paddingHorizontal: t.spacing.xl, gap: t.spacing.lg },
    title: { ...t.type.title, color: t.colors.text, marginTop: t.spacing.lg },
    subtitle: { ...t.type.body, color: t.colors.textMuted },
    roleRow: { flexDirection: "row", gap: t.spacing.md, marginTop: t.spacing.sm },
    roleCard: {
      flex: 1,
      padding: t.spacing.lg,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      gap: 4,
      minHeight: 88,
    },
    roleCardActive: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    roleTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
    roleTitle: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700", flexShrink: 1 },
    roleDesc: { ...t.type.small, color: t.colors.textMuted },
    form: { gap: t.spacing.md, marginTop: t.spacing.sm },
    tosRow: {
      flexDirection: "row",
      // Top-aligned, not centre-aligned: at large text sizes the label wraps to
      // three or four lines and a vertically centred checkbox drifts down to
      // the middle of the paragraph, away from the line it belongs to.
      alignItems: "flex-start",
      gap: t.spacing.md,
      marginTop: t.spacing.xs,
      minHeight: t.layout.touchTarget,
      paddingVertical: t.spacing.sm,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: t.colors.outline,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    tosText: { ...t.type.small, color: t.colors.textMuted, flex: 1 },
    error: { ...t.type.small, color: t.colors.danger },
    footer: {
      flexDirection: "row",
      gap: t.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      marginTop: t.spacing.md,
    },
    footerText: { ...t.type.body, color: t.colors.textMuted },
    textBtn: { minHeight: t.layout.touchTarget, justifyContent: "center" },
    link: { ...t.type.bodyStrong, color: t.colors.accentText, fontWeight: "700" },
  });
