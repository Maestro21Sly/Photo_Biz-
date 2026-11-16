import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { FeedCard } from "../../src/components/PhotographerCard";
import { EmptyState, ErrorState, Skeleton, SkeletonCard, Touchable } from "../../src/components/ui";
import { Screen, useContentWidth, useRefreshProps } from "../../src/components/Screen";
import { DiscoverMap, type MapPoint } from "../../src/components/DiscoverMap";
import { FilterSheet, type DiscoverFilters } from "../../src/components/FilterSheet";
import { useToast } from "../../src/components/Toast";
import {
  type FeedFilters,
  usePhotographers,
  useSpecialties,
  useToggleFavorite,
  useUnreadCount,
} from "../../src/lib/queries";
import { useAuth } from "../../src/lib/auth";
import { getCurrentCoords } from "../../src/lib/location";
import { haptics } from "../../src/lib/haptics";
import { useDebounced } from "../../src/lib/useDebounced";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { Photographer } from "../../src/types";

type Sort = "top" | "new" | "price" | "near";

const SORTS: { key: Sort; label: string }[] = [
  { key: "top", label: "Top rated" },
  { key: "new", label: "Newest" },
  { key: "price", label: "Price" },
  { key: "near", label: "Near me" },
];

function shortPrice(p: Photographer): string {
  if (p.pricing.hourlyRate) return `$${p.pricing.hourlyRate}`;
  if (p.pricing.startingAt) return `$${p.pricing.startingAt}`;
  return "$$";
}

export default function Discover() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [sort, setSort] = useState<Sort>("top");
  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<DiscoverFilters>({});

  // The box reacts instantly; the query waits for a pause in typing.
  const debouncedSearch = useDebounced(search, 300);

  const feedFilters = useMemo<FeedFilters>(
    () => ({
      q: debouncedSearch,
      specialty,
      sort,
      maxPrice: filters.maxPrice,
      minRating: filters.minRating,
      ...(sort === "near" && coords
        ? { lat: coords.latitude, lng: coords.longitude, radiusKm: 50 }
        : {}),
    }),
    [debouncedSearch, specialty, sort, filters, coords]
  );

  const query = usePhotographers(feedFilters);
  const specialties = useSpecialties();
  const toggleFav = useToggleFavorite();
  const unread = useUnreadCount();
  // Exclude next-page fetches: the footer spinner already covers those, and
  // showing the pull-to-refresh indicator during infinite scroll looks broken.
  const refreshProps = useRefreshProps(
    query.isRefetching && !query.isFetchingNextPage,
    query.refetch
  );

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const chips = useMemo(() => ["All", ...(specialties.data?.items ?? [])], [specialties.data]);
  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const activeFilters = (filters.maxPrice != null ? 1 : 0) + (filters.minRating != null ? 1 : 0);
  const hasQuery = Boolean(search || specialty !== "All" || activeFilters > 0);

  const points = useMemo<MapPoint[]>(
    () =>
      items
        .filter((p) => p.location)
        .map((p) => ({
          id: p.id,
          latitude: p.location!.latitude,
          longitude: p.location!.longitude,
          name: p.name,
          price: shortPrice(p),
        })),
    [items]
  );

  /* -------------------------------------------------- stable row handlers -- */

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
  const keyExtractor = useCallback((p: Photographer) => p.id, []);

  /* ------------------------------------------------------------- actions -- */

  const enableNearMe = async () => {
    if (coords) {
      setSort("near");
      return;
    }
    const c = await getCurrentCoords();
    if (!c) {
      haptics.warn();
      toast("Location permission is needed for Near me", "info");
      return;
    }
    setCoords(c);
    setSort("near");
  };

  const pickSort = (key: Sort) => {
    haptics.selection();
    if (key === "near") void enableNearMe();
    else setSort(key);
  };

  const clearAll = () => {
    haptics.tap();
    setSearch("");
    setSpecialty("All");
    setFilters({});
  };

  /* --------------------------------------------------------------- views -- */

  const listEmpty = query.isError ? (
    <ErrorState onRetry={query.refetch} message="We couldn't load photographers just now." />
  ) : query.isLoading ? (
    <View style={{ gap: t.spacing.lg }}>
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  ) : hasQuery ? (
    <EmptyState
      icon="search-outline"
      title="No photographers match that"
      body="Try a different specialty, widen your filters, or clear the search to see everyone on campus."
      actionLabel="Clear filters"
      onAction={clearAll}
    />
  ) : (
    <EmptyState
      icon="camera-outline"
      title="No photographers yet"
      body="Nobody has published a profile on your campus yet. Pull down to refresh, or become the first photographer here."
      actionLabel="Set up your profile"
      onAction={() => router.push("/(tabs)/profile")}
    />
  );

  return (
    <Screen>
      {/* Controls stay pinned; the greeting scrolls away with the feed so the
          photos get as much of a small screen as possible. */}
      <View style={[styles.controls, contentWidth]}>
        <View style={styles.searchRow}>
          <View style={styles.searchPill}>
            <Ionicons name="search" size={18} color={t.colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Graduation, portraits, South Quad…"
              placeholderTextColor={t.colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search photographers"
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={t.colors.accent}
              keyboardAppearance={t.isDark ? "dark" : "light"}
              maxFontSizeMultiplier={t.layout.maxFontScale}
            />
            {search.length > 0 ? (
              <Touchable
                onPress={() => setSearch("")}
                size={20}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={20} color={t.colors.textFaint} />
              </Touchable>
            ) : null}
          </View>

          <Touchable
            onPress={() => {
              haptics.tap();
              setFiltersOpen(true);
            }}
            style={styles.filterBtn}
            accessibilityRole="button"
            accessibilityLabel={
              activeFilters > 0 ? `Filters, ${activeFilters} active` : "Filters"
            }
            accessibilityHint="Opens price and rating filters"
          >
            <Ionicons name="options-outline" size={20} color={t.colors.text} />
            {activeFilters > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.badgeText} allowFontScaling={false}>
                  {activeFilters}
                </Text>
              </View>
            ) : null}
          </Touchable>

          <Touchable
            onPress={() => router.push("/notifications")}
            style={styles.bell}
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <Ionicons name="notifications-outline" size={22} color={t.colors.text} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} allowFontScaling={false}>
                  {unread > 9 ? "9+" : unread}
                </Text>
              </View>
            ) : null}
          </Touchable>
        </View>

        {/* Horizontal ScrollView rather than a nested FlatList: the row is short,
            virtualising it costs more than it saves and nesting VirtualizedLists
            is what produces the "nested list" warning. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          accessibilityRole="tablist"
          keyboardShouldPersistTaps="handled"
        >
          {chips.map((c) => (
            <SpecialtyChip
              key={c}
              label={c}
              active={specialty === c}
              onPress={() => {
                haptics.selection();
                setSpecialty(c);
              }}
            />
          ))}
        </ScrollView>

        <View style={styles.controlRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortRow}
            keyboardShouldPersistTaps="handled"
          >
            {SORTS.map((s) => (
              <Touchable
                key={s.key}
                onPress={() => pickSort(s.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sort === s.key }}
                accessibilityLabel={`Sort by ${s.label}`}
                style={styles.sortBtn}
              >
                <Text
                  style={[styles.sortLabel, sort === s.key && styles.sortLabelActive]}
                  maxFontSizeMultiplier={t.layout.maxFontScale}
                >
                  {s.label}
                </Text>
              </Touchable>
            ))}
          </ScrollView>

          <View style={styles.viewToggle} accessibilityRole="radiogroup">
            <Touchable
              onPress={() => {
                haptics.selection();
                setView("list");
              }}
              style={[styles.viewBtn, view === "list" && styles.viewBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: view === "list" }}
              accessibilityLabel="List view"
            >
              <Ionicons
                name="list"
                size={18}
                color={view === "list" ? t.colors.onAccent : t.colors.textMuted}
              />
            </Touchable>
            <Touchable
              onPress={() => {
                haptics.selection();
                setView("map");
              }}
              style={[styles.viewBtn, view === "map" && styles.viewBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: view === "map" }}
              accessibilityLabel="Map view"
            >
              <Ionicons
                name="map"
                size={16}
                color={view === "map" ? t.colors.onAccent : t.colors.textMuted}
              />
            </Touchable>
          </View>
        </View>
      </View>

      {view === "map" ? (
        <View style={[styles.mapArea, contentWidth]}>
          {/* The map view needs the same three states as the list. Without the
              first two branches a slow network showed "Nothing to map yet",
              which reads as "there is nobody here" rather than "still loading". */}
          {query.isError ? (
            <ErrorState onRetry={query.refetch} message="We couldn't load the map." />
          ) : query.isLoading ? (
            <Skeleton
              height={undefined}
              width="100%"
              radius={t.radius.lg}
              style={{ flex: 1 }}
            />
          ) : points.length === 0 ? (
            <EmptyState
              icon="map-outline"
              title="Nothing to map yet"
              body="None of these photographers have set a location. Switch back to the list to browse them."
              actionLabel="Back to list"
              onAction={() => setView("list")}
            />
          ) : (
            <DiscoverMap points={points} onSelect={openPhotographer} />
          )}
        </View>
      ) : (
        <FlatList<Photographer>
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, contentWidth]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.greetBlock}>
              <Text style={styles.greeting}>Hi {firstName} 👋</Text>
              <Text style={styles.title} accessibilityRole="header">
                Find your photographer
              </Text>
            </View>
          }
          ItemSeparatorComponent={Separator}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          /* Scroll tuning: cards are tall and image-heavy, so render a small
             window and keep the batch size modest to protect frame time. */
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={60}
          windowSize={7}
          // Known to clip rows unpredictably on iOS; Android is where it pays off.
          removeClippedSubviews={Platform.OS === "android"}
          refreshControl={
            <RefreshControl {...refreshProps} />
          }
          ListEmptyComponent={listEmpty}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator
                color={t.colors.accent}
                style={{ marginVertical: t.spacing.xl }}
                accessibilityLabel="Loading more photographers"
              />
            ) : items.length > 0 && !query.hasNextPage ? (
              <Text style={styles.endOfFeed}>That's everyone on campus for now.</Text>
            ) : (
              <View style={{ height: t.spacing.xl }} />
            )
          }
        />
      )}

      <FilterSheet
        visible={filtersOpen}
        initial={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(f) => {
          haptics.tap();
          setFilters(f);
          setFiltersOpen(false);
        }}
      />
    </Screen>
  );
}

/** Extracted so the separator element identity is stable across renders. */
function Separator() {
  const t = useTheme();
  return <View style={{ height: t.spacing.lg }} />;
}

function SpecialtyChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} photography`}
      style={[styles.chip, active && styles.chipActive]}
      pressedOpacity={0.7}
    >
      <Text
        style={[styles.chipLabel, active && styles.chipLabelActive]}
        maxFontSizeMultiplier={t.layout.maxFontScale}
      >
        {label}
      </Text>
    </Touchable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  controls: {
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.sm,
    gap: t.spacing.md,
  },
  searchRow: { flexDirection: "row", gap: t.spacing.sm, alignItems: "center" },
  searchPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.sm,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.spacing.lg,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    ...t.type.body,
    color: t.colors.text,
    paddingVertical: t.spacing.sm,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  filterBtn: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: t.colors.bg,
  },
  filterBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: t.colors.bg,
  },
  badgeText: { color: t.colors.onAccent, fontSize: 10, fontWeight: "800" },

  chipsRow: { gap: t.spacing.sm, paddingVertical: 2, paddingRight: t.spacing.lg },
  chip: {
    paddingHorizontal: t.spacing.lg,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  chipActive: { backgroundColor: t.colors.text, borderColor: t.colors.text },
  chipLabel: { ...t.type.small, color: t.colors.text, fontWeight: "600" },
  chipLabelActive: { color: t.colors.bg },

  controlRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
  sortRow: { gap: t.spacing.xs, alignItems: "center", paddingRight: t.spacing.sm },
  sortBtn: {
    minHeight: t.layout.touchTarget,
    justifyContent: "center",
    paddingHorizontal: t.spacing.sm,
  },
  sortLabel: { ...t.type.small, color: t.colors.textFaint, fontWeight: "600" },
  sortLabelActive: { color: t.colors.text, textDecorationLine: "underline" },

  viewToggle: {
    flexDirection: "row",
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.pill,
    padding: 3,
    gap: 2,
  },
  viewBtn: {
    width: 38,
    height: 32,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtnActive: { backgroundColor: t.colors.accent },

  mapArea: { flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg },
  list: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing["3xl"] },
  greetBlock: { paddingBottom: t.spacing.lg, gap: 2 },
  greeting: { ...t.type.body, color: t.colors.textMuted },
  title: { ...t.type.title, color: t.colors.text },
  endOfFeed: {
    ...t.type.small,
    color: t.colors.textFaint,
    textAlign: "center",
    paddingVertical: t.spacing["2xl"],
  },
});
