import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/lib/auth";
import { ToastProvider } from "../src/components/Toast";
import { registerForPush } from "../src/lib/push";
import { ThemeProvider, useTheme } from "../src/theme";
import { useReducedMotion } from "../src/lib/a11y";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
});

function AuthGate() {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    // Email-link landing pages work for both guests and signed-in users.
    const exempt = segments[0] === "reset-password" || segments[0] === "verify-email";
    if (exempt) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (status === "guest" && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (status === "authenticated" && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  useEffect(() => {
    if (status === "authenticated") registerForPush();
  }, [status]);

  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.colors.bg,
          gap: t.spacing.lg,
        }}
        accessibilityLabel="Loading SnapCampus"
        accessibilityLiveRegion="polite"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: t.colors.accent }} />
          <Text style={{ ...t.type.h2, color: t.colors.text, fontWeight: "800" }}>SnapCampus</Text>
        </View>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  // Slide transitions become a cross-fade under reduce-motion rather than
  // disappearing entirely — the user still gets a cue that the screen changed.
  const push = reduceMotion ? ("fade" as const) : ("slide_from_right" as const);
  const modal = reduceMotion ? ("fade" as const) : undefined;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Without this the gap between screens flashes white in dark mode.
        contentStyle: { backgroundColor: t.colors.bg },
        animation: push,
      }}
    >
      <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="photographer/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="booking/[photographerId]" options={{ presentation: "modal", animation: modal }} />
      <Stack.Screen name="booking-detail/[id]" />
      <Stack.Screen name="review/[bookingId]" options={{ presentation: "modal", animation: modal }} />
      <Stack.Screen name="chat/[threadId]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}

/** Status bar contents must invert with the scheme, so it lives under the provider. */
function ThemedStatusBar() {
  const { isDark, colors } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} backgroundColor={colors.headerBg} />;
}

function ThemedRoot() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ThemedStatusBar />
      <AuthGate />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <AuthProvider>
                <ThemedRoot />
              </AuthProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
