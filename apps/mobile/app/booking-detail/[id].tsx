import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, Button, Divider, ErrorState, Skeleton, StatusPill } from "../../src/components/ui";
import {
  Screen,
  ScreenHeader,
  useContentWidth,
  useRefreshProps,
} from "../../src/components/Screen";
import { MapPicker } from "../../src/components/MapPicker";
import { useBooking } from "../../src/lib/queries";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { BookingStatus } from "../../src/types";

const STATUS: Record<BookingStatus, { tone: "neutral" | "pending" | "ok" | "bad"; label: string }> = {
  REQUESTED: { tone: "pending", label: "Pending" },
  ACCEPTED: { tone: "ok", label: "Confirmed" },
  DECLINED: { tone: "bad", label: "Declined" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
};

export default function BookingDetail() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: b, isLoading, isError, isRefetching, refetch } = useBooking(id);
  // The other party can accept, decline or quote while this screen is open, so
  // a manual refresh is the difference between "Pending" and the truth.
  const refreshProps = useRefreshProps(isRefetching, refetch);

  if (isLoading) {
    return (
      <Screen edgeTop={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <View
          style={[styles.scroll, contentWidth, { gap: t.spacing.lg }]}
          accessibilityLabel="Loading booking"
          accessibilityLiveRegion="polite"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
            <Skeleton height={48} width={48} radius={24} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={22} width="55%" />
              <Skeleton height={13} width="35%" />
            </View>
            <Skeleton height={26} width={80} radius={t.radius.pill} />
          </View>
          <Skeleton height={160} width="100%" radius={t.radius.md} />
          <Skeleton height={48} width="100%" radius={t.radius.pill} />
        </View>
      </Screen>
    );
  }

  if (isError || !b) {
    return (
      <Screen edgeTop={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <ErrorState onRetry={refetch} message="We couldn't load this booking." />
      </Screen>
    );
  }

  const s = STATUS[b.status];
  const other = b.role === "client" ? b.photographer : b.client;
  const when = new Date(b.eventDate).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const canReview = b.role === "client" && b.status === "COMPLETED" && !b.reviewed;

  return (
    <Screen edgeTop={false}>
      <ScreenHeader title="Booking" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.scroll, contentWidth, { paddingBottom: insets.bottom + 44 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refreshProps} />}
      >
        <View style={styles.topRow}>
          <Avatar name={other?.name ?? "?"} uri={other?.avatarUrl} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.event}>{b.eventType}</Text>
            <Text style={styles.with}>
              {b.role === "client" ? "with" : "for"} {other?.name}
            </Text>
          </View>
          <StatusPill tone={s.tone} label={s.label} />
        </View>

        <View style={styles.infoCard}>
          <Row icon="calendar-outline" label="When" value={when} />
          <Row icon="location-outline" label="Where" value={b.location} />
          {b.durationHours ? (
            <Row icon="time-outline" label="Duration" value={`${b.durationHours} hours`} />
          ) : null}
          <Row
            icon="pricetag-outline"
            label="Quote"
            value={b.quotedPrice != null ? `$${b.quotedPrice}` : "Not quoted yet"}
          />
        </View>

        {b.message ? (
          <View>
            <Text style={styles.sectionLabel} accessibilityRole="header">
              Message
            </Text>
            <View style={styles.messageCard}>
              <Text style={styles.message}>{b.message}</Text>
            </View>
          </View>
        ) : null}

        {b.latitude != null && b.longitude != null ? (
          <View>
            <Text style={styles.sectionLabel} accessibilityRole="header">
              Location pin
            </Text>
            {/* Read-only: this is a record of where the shoot is, not a picker. */}
            <MapPicker
              value={{ latitude: b.latitude, longitude: b.longitude }}
              onChange={() => {}}
              height={200}
              readOnly
            />
          </View>
        ) : null}

        <Divider />

        <View style={{ gap: t.spacing.md }}>
          {b.threadId ? (
            <Button
              label="Open chat"
              variant="secondary"
              icon={<Ionicons name="chatbubble-outline" size={18} color={t.colors.text} />}
              onPress={() =>
                router.push(`/chat/${b.threadId}?name=${encodeURIComponent(other?.name ?? "")}`)
              }
              full
            />
          ) : null}
          {canReview ? (
            <Button
              label="Leave a review"
              onPress={() =>
                router.push(
                  `/review/${b.id}?photographerId=${b.photographer?.id}&name=${encodeURIComponent(b.photographer?.name ?? "")}`
                )
              }
              full
            />
          ) : null}
          {b.reviewed ? (
            <View style={styles.reviewedRow}>
              <Ionicons name="checkmark-circle" size={18} color={t.colors.success} />
              <Text style={styles.reviewed}>You reviewed this shoot</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  // The label column is a fixed 74pt so the four values line up. That column
  // cannot hold "Duration" once the OS text size passes ~130%, so above that
  // the label moves onto its own line and the alignment is given up rather
  // than the word.
  const stacked = fontScale > 1.3;

  return (
    <View
      style={[styles.row, stacked && { flexDirection: "column", gap: 2 }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.rowHead}>
        <Ionicons name={icon} size={18} color={t.colors.textMuted} />
        <Text style={[styles.rowLabel, stacked && { width: undefined }]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, stacked && { marginLeft: 26 }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scroll: { padding: t.spacing.xl, gap: t.spacing.lg },
    topRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.md },
    event: { ...t.type.title, color: t.colors.text },
    with: { ...t.type.body, color: t.colors.textMuted, marginTop: 2 },
    infoCard: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      gap: t.spacing.md,
    },
    row: { flexDirection: "row", alignItems: "flex-start", gap: t.spacing.sm },
    rowHead: { flexDirection: "row", alignItems: "flex-start", gap: t.spacing.sm },
    rowLabel: { ...t.type.small, color: t.colors.textMuted, width: 74 },
    rowValue: { ...t.type.body, color: t.colors.text, flex: 1, fontWeight: "600" },
    sectionLabel: {
      ...t.type.small,
      color: t.colors.textMuted,
      fontWeight: "700",
      marginBottom: t.spacing.sm,
    },
    messageCard: {
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      // A leading rule reads as a quotation without relying on smart quotes.
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accent,
    },
    message: { ...t.type.body, color: t.colors.text },
    reviewedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    reviewed: { ...t.type.body, color: t.colors.success, fontWeight: "600" },
  });
