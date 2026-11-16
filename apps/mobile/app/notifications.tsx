import React, { memo, useCallback, useEffect } from "react";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, SkeletonRow } from "../src/components/ui";
import {
  Screen,
  ScreenHeader,
  useContentWidth,
  useRefreshProps,
} from "../src/components/Screen";
import { useNotifications } from "../src/lib/queries";
import { api } from "../src/lib/api";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";
import type { AppNotification } from "../src/types";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  BOOKING_REQUESTED: "calendar",
  BOOKING_ACCEPTED: "checkmark-circle",
  BOOKING_DECLINED: "close-circle",
  BOOKING_CANCELLED: "close-circle",
  BOOKING_COMPLETED: "ribbon",
  NEW_MESSAGE: "chatbubble",
  NEW_REVIEW: "star",
  SYSTEM: "information-circle",
};

function ago(iso: string): { short: string; long: string } {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return { short: "now", long: "just now" };
  if (m < 60) return { short: `${m}m`, long: `${m} minute${m === 1 ? "" : "s"} ago` };
  if (m < 1440) {
    const h = Math.floor(m / 60);
    return { short: `${h}h`, long: `${h} hour${h === 1 ? "" : "s"} ago` };
  }
  const d = Math.floor(m / 1440);
  return { short: `${d}d`, long: `${d} day${d === 1 ? "" : "s"} ago` };
}

export default function NotificationsScreen() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const refreshProps = useRefreshProps(isRefetching, refetch);

  // Mark everything read when the inbox is opened.
  useEffect(() => {
    if (data && data.unread > 0) {
      api("/notifications/read", { method: "POST", body: {} })
        .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
        .catch(() => {});
    }
  }, [data, qc]);

  const open = useCallback(
    (n: AppNotification) => {
      const threadId = n.data?.threadId as string | undefined;
      const bookingId = n.data?.bookingId as string | undefined;
      if (threadId) router.push(`/chat/${threadId}`);
      else if (bookingId) router.push(`/booking-detail/${bookingId}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => <NotificationRow item={item} onPress={open} />,
    [open]
  );

  return (
    <Screen edgeTop={false}>
      <ScreenHeader title="Notifications" onBack={() => router.back()} bordered={false} />

      {isError ? (
        <ErrorState onRetry={refetch} message="We couldn't load your notifications." />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, contentWidth]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === "android"}
          refreshControl={
            <RefreshControl {...refreshProps} />
          }
          ListEmptyComponent={
            isLoading ? (
              <View>
                {[0, 1, 2].map((i) => (
                  <SkeletonRow key={i} avatarSize={38} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="notifications-outline"
                title="You're all caught up"
                body="Booking updates, new messages, and reviews land here so you never miss one."
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const NotificationRow = memo(function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (n: AppNotification) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const unread = !item.readAt;
  const time = ago(item.createdAt);
  const actionable = Boolean(item.data?.threadId || item.data?.bookingId);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && { opacity: 0.8 }]}
      onPress={() => onPress(item)}
      disabled={!actionable}
      accessibilityRole={actionable ? "button" : "text"}
      accessibilityLabel={`${unread ? "Unread. " : ""}${item.title}. ${item.body}. ${time.long}`}
      accessibilityHint={actionable ? "Opens the related booking or conversation" : undefined}
    >
      <View style={[styles.iconWrap, unread && { backgroundColor: t.colors.surface }]}>
        <Ionicons
          name={ICON[item.type] ?? "notifications"}
          size={18}
          color={unread ? t.colors.accent : t.colors.textMuted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, unread && { color: t.colors.text }]}>{item.title}</Text>
        {item.body ? (
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>
      <Text style={styles.time} maxFontSizeMultiplier={t.layout.maxFontScale}>
        {time.short}
      </Text>
    </Pressable>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    list: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing["3xl"],
      gap: t.spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.md,
      padding: t.spacing.md,
      minHeight: 62,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    // Unread is carried by fill AND weight, never colour alone.
    rowUnread: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accentSoft },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: t.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTitle: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700" },
    rowBody: { ...t.type.small, color: t.colors.textMuted, marginTop: 1 },
    time: { ...t.type.small, color: t.colors.textFaint },
  });
