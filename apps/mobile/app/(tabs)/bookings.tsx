import React, { memo, useCallback, useState } from "react";
import { StyleSheet, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  SkeletonBookingCard,
  StatusPill,
} from "../../src/components/ui";
import {
  KeyboardScreen,
  Screen,
  useContentWidth,
  useRefreshProps,
} from "../../src/components/Screen";
import { useToast } from "../../src/components/Toast";
import { useBookings } from "../../src/lib/queries";
import { api, ApiError } from "../../src/lib/api";
import { confirm } from "../../src/lib/confirm";
import { haptics } from "../../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { Booking, BookingStatus } from "../../src/types";

type StatusUpdate = { id: string; status: BookingStatus; quotedPrice?: number };

const STATUS_TONE: Record<BookingStatus, { tone: "neutral" | "pending" | "ok" | "bad"; label: string }> = {
  REQUESTED: { tone: "pending", label: "Pending" },
  ACCEPTED: { tone: "ok", label: "Confirmed" },
  DECLINED: { tone: "bad", label: "Declined" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
};

export default function Bookings() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useBookings();
  const qc = useQueryClient();
  const refreshProps = useRefreshProps(isRefetching, refetch);
  const items = data?.items ?? [];

  const updateStatus = useMutation({
    mutationFn: ({ id, status, quotedPrice }: StatusUpdate) =>
      api(`/bookings/${id}/status`, { method: "PATCH", body: { status, quotedPrice } }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      const verb =
        vars.status === "ACCEPTED"
          ? "accepted"
          : vars.status === "DECLINED"
            ? "declined"
            : vars.status === "COMPLETED"
              ? "marked complete"
              : "cancelled";
      haptics.success();
      toast(`Booking ${verb}`, "success");
    },
    onError: (e) => {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't update booking", "error");
    },
  });

  const onUpdate = useCallback((input: StatusUpdate) => updateStatus.mutate(input), [updateStatus]);
  const onOpen = useCallback((id: string) => router.push(`/booking-detail/${id}`), [router]);
  const onReview = useCallback(
    (b: Booking) =>
      router.push(
        `/review/${b.id}?photographerId=${b.photographer?.id}&name=${encodeURIComponent(b.photographer?.name ?? "")}`
      ),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Booking }) => (
      <BookingRow
        booking={item}
        pending={updateStatus.isPending}
        onUpdate={onUpdate}
        onOpen={onOpen}
        onReview={onReview}
      />
    ),
    [updateStatus.isPending, onUpdate, onOpen, onReview]
  );

  return (
    <Screen>
      {/* The inline "quote & accept" field lives inside the list, so the whole
          screen has to move out of the keyboard's way. */}
      <KeyboardScreen style={{ backgroundColor: "transparent" }}>
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, contentWidth]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS === "android"}
          refreshControl={
            <RefreshControl {...refreshProps} />
          }
          ListHeaderComponent={
            <Text style={styles.title} accessibilityRole="header">
              Bookings
            </Text>
          }
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            isError ? (
              <ErrorState onRetry={refetch} message="We couldn't load your bookings." />
            ) : isLoading ? (
              <View style={{ gap: t.spacing.md }}>
                {[0, 1].map((i) => (
                  <SkeletonBookingCard key={i} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="calendar-outline"
                title="No bookings yet"
                body="When you request a shoot — or a student requests one from you — it shows up here with its status."
                actionLabel="Find a photographer"
                onAction={() => router.push("/(tabs)")}
              />
            )
          }
        />
      </KeyboardScreen>
    </Screen>
  );
}

/** Stable component type — see the note in saved.tsx. */
function Separator() {
  const t = useTheme();
  return <View style={{ height: t.spacing.md }} />;
}

const BookingRow = memo(function BookingRow({
  booking,
  pending,
  onUpdate,
  onOpen,
  onReview,
}: {
  booking: Booking;
  pending: boolean;
  onUpdate: (input: StatusUpdate) => void;
  onOpen: (id: string) => void;
  onReview: (b: Booking) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const status = STATUS_TONE[booking.status];
  const other = booking.role === "client" ? booking.photographer : booking.client;
  const isPhotographer = booking.role === "photographer";
  const date = new Date(booking.eventDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const summary = `${booking.eventType} with ${other?.name ?? "someone"}, ${date}, ${status.label}`;

  const decline = async () => {
    if (
      await confirm({
        title: "Decline this booking?",
        message: "They'll be told it doesn't work for you. You can still message them.",
        confirmLabel: "Decline",
        destructive: true,
      })
    ) {
      onUpdate({ id: booking.id, status: "DECLINED" });
    }
  };

  const cancel = async () => {
    if (
      await confirm({
        title: "Cancel this request?",
        message: "This withdraws your request. You'd need to send a new one to book them.",
        confirmLabel: "Cancel request",
        cancelLabel: "Keep it",
        destructive: true,
      })
    ) {
      onUpdate({ id: booking.id, status: "CANCELLED" });
    }
  };

  const confirmQuote = () => {
    const trimmed = quote.trim();
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setQuoteError("Enter a price like 150, or leave it blank.");
        haptics.error();
        return;
      }
      onUpdate({ id: booking.id, status: "ACCEPTED", quotedPrice: n });
    } else {
      onUpdate({ id: booking.id, status: "ACCEPTED" });
    }
    setQuoteError(null);
    setQuoting(false);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}
      onPress={() => onOpen(booking.id)}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Opens the full booking"
    >
      <View style={styles.cardTop}>
        <Avatar name={other?.name ?? "?"} uri={other?.avatarUrl} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.event} numberOfLines={1}>
            {booking.eventType}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {other?.name} · {date}
          </Text>
        </View>
        <StatusPill tone={status.tone} label={status.label} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={t.colors.textMuted} />
          <Text style={styles.location} numberOfLines={1}>
            {booking.location}
            {booking.durationHours ? ` · ${booking.durationHours}h` : ""}
          </Text>
        </View>
        {booking.quotedPrice != null ? (
          <Text style={styles.quote} maxFontSizeMultiplier={t.layout.maxFontScale}>
            ${booking.quotedPrice}
          </Text>
        ) : null}
      </View>

      {/* Photographer, incoming request */}
      {isPhotographer && booking.status === "REQUESTED" && !quoting ? (
        <View style={styles.actions}>
          <Button
            label="Decline"
            variant="secondary"
            disabled={pending}
            onPress={decline}
            style={{ flex: 1 }}
          />
          <Button
            label="Quote & accept"
            disabled={pending}
            onPress={() => setQuoting(true)}
            style={{ flex: 1.3 }}
          />
        </View>
      ) : null}

      {isPhotographer && booking.status === "REQUESTED" && quoting ? (
        <View style={{ gap: t.spacing.xs, marginTop: t.spacing.sm }}>
          <View style={styles.quoteRow}>
            <View style={[styles.quoteInputWrap, quoteError ? styles.quoteInputError : null]}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={quote}
                onChangeText={(v) => {
                  setQuote(v);
                  setQuoteError(null);
                }}
                placeholder="Price (optional)"
                placeholderTextColor={t.colors.textFaint}
                keyboardType="number-pad"
                style={styles.quoteInput}
                accessibilityLabel="Your quoted price in dollars"
                selectionColor={t.colors.accent}
                keyboardAppearance={t.isDark ? "dark" : "light"}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={confirmQuote}
              />
            </View>
            <Button label="Confirm" disabled={pending} onPress={confirmQuote} haptic="press" />
          </View>
          {quoteError ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {quoteError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {isPhotographer && booking.status === "ACCEPTED" ? (
        <View style={styles.actions}>
          <Button
            label="Mark completed"
            disabled={pending}
            haptic="press"
            onPress={() => onUpdate({ id: booking.id, status: "COMPLETED" })}
            full
          />
        </View>
      ) : null}

      {/* Client */}
      {!isPhotographer && (booking.status === "REQUESTED" || booking.status === "ACCEPTED") ? (
        <View style={styles.actions}>
          <Button label="Cancel request" variant="secondary" disabled={pending} onPress={cancel} full />
        </View>
      ) : null}

      {!isPhotographer && booking.status === "COMPLETED" && !booking.reviewed ? (
        <View style={styles.actions}>
          <Button
            label="Leave a review"
            onPress={() => onReview(booking)}
            accessibilityHint={`Rate your shoot with ${booking.photographer?.name ?? "your photographer"}`}
            full
          />
        </View>
      ) : null}

      {!isPhotographer && booking.status === "COMPLETED" && booking.reviewed ? (
        <View style={styles.reviewedRow}>
          <Ionicons name="checkmark-circle" size={16} color={t.colors.success} />
          <Text style={styles.reviewed}>Reviewed</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  list: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing["3xl"] },
  title: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.lg },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: t.spacing.md },
  event: { ...t.type.h3, color: t.colors.text },
  meta: { ...t.type.small, color: t.colors.textMuted, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.spacing.sm },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  location: { ...t.type.small, color: t.colors.textMuted, flex: 1 },
  quote: { ...t.type.bodyStrong, color: t.colors.success, fontWeight: "800" },
  actions: { flexDirection: "row", gap: t.spacing.md, marginTop: t.spacing.sm },
  quoteRow: { flexDirection: "row", gap: t.spacing.md, alignItems: "center" },
  quoteInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: t.spacing.lg,
    minHeight: 52,
  },
  quoteInputError: { borderColor: t.colors.danger, borderWidth: 1.5 },
  dollar: { ...t.type.h3, color: t.colors.textMuted },
  quoteInput: {
    flex: 1,
    ...t.type.body,
    color: t.colors.text,
    marginLeft: 4,
    paddingVertical: t.spacing.md,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  error: { ...t.type.small, color: t.colors.danger },
  reviewedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: t.spacing.xs },
  reviewed: { ...t.type.small, color: t.colors.success, fontWeight: "700" },
});
