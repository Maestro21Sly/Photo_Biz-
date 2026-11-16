import React, { memo, useCallback } from "react";
import { StyleSheet, FlatList, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar, EmptyState, ErrorState, SkeletonRow } from "../../src/components/ui";
import { Screen, useContentWidth, useRefreshProps } from "../../src/components/Screen";
import { useThreads } from "../../src/lib/queries";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { ThreadSummary } from "../../src/types";

/** Compact relative time — full text goes to the accessibility label. */
function timeAgo(iso: string): { short: string; long: string } {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return { short: "now", long: "just now" };
  if (m < 60) return { short: `${m}m`, long: `${m} minute${m === 1 ? "" : "s"} ago` };
  const h = Math.floor(m / 60);
  if (h < 24) return { short: `${h}h`, long: `${h} hour${h === 1 ? "" : "s"} ago` };
  const d = Math.floor(h / 24);
  return { short: `${d}d`, long: `${d} day${d === 1 ? "" : "s"} ago` };
}

export default function Messages() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useThreads();
  const refreshProps = useRefreshProps(isRefetching, refetch);
  const items = data?.items ?? [];

  const openThread = useCallback(
    (id: string, name: string) => router.push(`/chat/${id}?name=${encodeURIComponent(name)}`),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: ThreadSummary }) => <ThreadRow thread={item} onOpen={openThread} />,
    [openThread]
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(th) => th.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, contentWidth]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl {...refreshProps} />
        }
        ListHeaderComponent={
          <Text style={styles.title} accessibilityRole="header">
            Messages
          </Text>
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          isError ? (
            <ErrorState onRetry={refetch} message="We couldn't load your conversations." />
          ) : isLoading ? (
            <View>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="chatbubble-outline"
              title="No conversations yet"
              body="Message a photographer from their profile to ask about availability, pricing, or your idea for the shoot."
              actionLabel="Find a photographer"
              onAction={() => router.push("/(tabs)")}
            />
          )
        }
      />
    </Screen>
  );
}

/** Stable component type — see the note in saved.tsx. */
function Separator() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.sep} />;
}

const ThreadRow = memo(function ThreadRow({
  thread,
  onOpen,
}: {
  thread: ThreadSummary;
  onOpen: (id: string, name: string) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const time = thread.lastMessage ? timeAgo(thread.lastMessage.createdAt) : null;
  const preview = thread.lastMessage?.body ?? "Say hello 👋";

  const label = [
    thread.other.name,
    thread.unread > 0 ? `${thread.unread} unread message${thread.unread === 1 ? "" : "s"}` : null,
    preview,
    time ? time.long : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={() => onOpen(thread.id, thread.other.name)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this conversation"
    >
      <Avatar name={thread.other.name} uri={thread.other.avatarUrl} size={52} />
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {thread.other.name}
          </Text>
          {time ? (
            <Text style={styles.time} maxFontSizeMultiplier={t.layout.maxFontScale}>
              {time.short}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.preview, thread.unread > 0 && styles.previewUnread]}
          numberOfLines={1}
        >
          {preview}
        </Text>
      </View>
      {thread.unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} allowFontScaling={false}>
            {thread.unread > 99 ? "99+" : thread.unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  list: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing["3xl"] },
  title: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.md,
    paddingVertical: t.spacing.md,
    // Guarantees the row itself clears the 44pt target even with a short preview.
    minHeight: 68,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: t.spacing.sm },
  name: { ...t.type.h3, color: t.colors.text, flex: 1 },
  time: { ...t.type.small, color: t.colors.textFaint },
  sep: { height: 1, backgroundColor: t.colors.border, marginLeft: 64 },
  preview: { ...t.type.body, color: t.colors.textMuted, marginTop: 2 },
  previewUnread: { color: t.colors.text, fontWeight: "600" },
  badge: {
    backgroundColor: t.colors.accent,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: t.colors.onAccent, fontSize: 12, fontWeight: "700" },
});
