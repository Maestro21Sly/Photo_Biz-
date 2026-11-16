import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Field, Touchable } from "../../src/components/ui";
import { KeyboardScreen, ScreenHeader, useContentWidth } from "../../src/components/Screen";
import { useToast } from "../../src/components/Toast";
import { useCreateReview } from "../../src/lib/queries";
import { ApiError } from "../../src/lib/api";
import { haptics } from "../../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const RATING_WORDS = ["", "Not great", "Okay", "Good", "Great", "Outstanding"];

export default function ReviewComposer() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth(480);
  const { bookingId, photographerId, name } = useLocalSearchParams<{
    bookingId: string;
    photographerId: string;
    name?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const createReview = useCreateReview();

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (rating < 1) {
      setError("Tap a star to rate your shoot.");
      haptics.warn();
      return;
    }
    setError(null);
    try {
      await createReview.mutateAsync({
        photographerId,
        bookingId,
        rating,
        body: body.trim() || undefined,
      });
      haptics.success();
      toast("Thanks for your review!", "success");
      router.back();
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't submit review", "error");
    }
  };

  return (
    <KeyboardScreen>
      <ScreenHeader
        title="Leave a review"
        onBack={() => router.back()}
        backIcon="close"
        backLabel="Close"
        bordered={false}
      />

      <ScrollView
        contentContainerStyle={[styles.body, contentWidth, { paddingBottom: insets.bottom + 44 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          {name ? `How was your shoot with ${name}?` : "How was your shoot?"}
        </Text>

        {/* Each star is its own button: dragging across a single control is not
            discoverable and is unusable with a screen reader. */}
        <View style={styles.stars} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <Touchable
              key={n}
              onPress={() => {
                haptics.selection();
                setRating(n);
                setError(null);
              }}
              style={styles.starBtn}
              accessibilityRole="radio"
              accessibilityState={{ selected: rating === n }}
              accessibilityLabel={`${n} star${n > 1 ? "s" : ""} — ${RATING_WORDS[n]}`}
              pressedOpacity={0.6}
            >
              <Ionicons
                name={n <= rating ? "star" : "star-outline"}
                size={40}
                color={n <= rating ? t.colors.star : t.colors.outline}
              />
            </Touchable>
          ))}
        </View>

        <Text style={styles.ratingWord} accessibilityLiveRegion="polite">
          {rating > 0 ? RATING_WORDS[rating] : "Tap a star to rate"}
        </Text>

        <Field
          label="Tell others about it (optional)"
          value={body}
          onChangeText={setBody}
          placeholder="Great with direction, fast turnaround, made everyone comfortable…"
          multiline
          style={{ minHeight: 130, paddingTop: t.spacing.md, textAlignVertical: "top" }}
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button
          label="Post review"
          onPress={submit}
          loading={createReview.isPending}
          haptic="press"
          full
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    body: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.lg },
    subtitle: { ...t.type.h3, color: t.colors.text },
    stars: { flexDirection: "row", justifyContent: "center", gap: t.spacing.xs },
    starBtn: {
      minWidth: t.layout.touchTarget,
      minHeight: t.layout.touchTarget + 8,
      alignItems: "center",
      justifyContent: "center",
    },
    ratingWord: {
      ...t.type.bodyStrong,
      color: t.colors.textMuted,
      textAlign: "center",
      marginTop: -t.spacing.sm,
    },
    error: { ...t.type.small, color: t.colors.danger },
  });
