import React, { useCallback } from "react";
import { StyleSheet, FlatList, Platform, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FeedCard } from "../../src/components/PhotographerCard";
import { EmptyState, ErrorState, SkeletonCard } from "../../src/components/ui";
import { Screen, useContentWidth, useRefreshProps } from "../../src/components/Screen";
import { useFavorites, useToggleFavorite } from "../../src/lib/queries";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { Photographer } from "../../src/types";

export default function Saved() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useFavorites();
  const toggleFav = useToggleFavorite();
  const refreshProps = useRefreshProps(isRefetching, refetch);
  const items = data?.items ?? [];

  const openPhotographer = useCallback((id: string) => router.push(`/photographer/${id}`), [router]);
  const toggleFavorite = useCallback(
    (id: string, next: boolean) => toggleFav.mutate({ id, next }),
    [toggleFav]
  );
  const renderItem = useCallback(
    ({ item }: { item: Photographer }) => (
      <FeedCard item={item} onOpen={openPhotographer} onToggle={toggleFavorite} />
    ),
    [openPhotographer, toggleFavorite]
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, contentWidth]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl {...refreshProps} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Saved
            </Text>
            {items.length > 0 ? (
              <Text style={styles.count}>
                {items.length} photographer{items.length === 1 ? "" : "s"} you're considering
              </Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          isError ? (
            <ErrorState onRetry={refetch} message="We couldn't load your saved photographers." />
          ) : isLoading ? (
            <View style={{ gap: t.spacing.lg }}>
              {[0, 1].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="heart-outline"
              title="Nothing saved yet"
              body="Tap the heart on any photographer to keep them here while you compare styles and prices."
              actionLabel="Browse photographers"
              onAction={() => router.push("/(tabs)")}
            />
          )
        }
      />
    </Screen>
  );
}

/**
 * Module-level so its component *type* is stable. An inline arrow is a new
 * type on every parent render, which makes FlatList unmount and remount every
 * separator in the list rather than reusing them.
 */
function Separator() {
  const t = useTheme();
  return <View style={{ height: t.spacing.lg }} />;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  list: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing["3xl"] },
  header: { marginBottom: t.spacing.lg, gap: 2 },
  title: { ...t.type.title, color: t.colors.text },
  count: { ...t.type.small, color: t.colors.textMuted },
});
