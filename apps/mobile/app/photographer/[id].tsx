import React, { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  Avatar,
  Button,
  Divider,
  ErrorState,
  RatingPill,
  Skeleton,
  Touchable,
  VerifiedBadge,
} from "../../src/components/ui";
import { StickyFooter, useContentWidth, useRefreshProps } from "../../src/components/Screen";
import { SmartImage } from "../../src/components/SmartImage";
import { Lightbox } from "../../src/components/Lightbox";
import { ActionSheet } from "../../src/components/ActionSheet";
import { useToast } from "../../src/components/Toast";
import { usePhotographer, useToggleFavorite, useReport, useBlock } from "../../src/lib/queries";
import { useAuth } from "../../src/lib/auth";
import { api, ApiError } from "../../src/lib/api";
import { confirm } from "../../src/lib/confirm";
import { haptics } from "../../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { PortfolioImage } from "../../src/types";

export default function PhotographerProfile() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { width, fontScale } = useWindowDimensions();

  const { data: p, isLoading, isError, isRefetching, refetch } = usePhotographer(id);
  const refreshProps = useRefreshProps(isRefetching, refetch);
  const toggleFav = useToggleFavorite();
  const report = useReport();
  const block = useBlock();

  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  // Read from the hook, never `Dimensions.get()` at module scope — that value is
  // captured once and goes stale the moment a browser window is resized.
  const galleryWidth = Math.min(width, t.layout.contentMaxWidth);
  const galleryHeight = Math.round(galleryWidth / t.aspect.portrait);

  const media = useMemo<PortfolioImage[]>(() => p?.media ?? [], [p?.media]);

  const onGalleryScroll = useCallback(
    (offsetX: number) => {
      const next = Math.round(offsetX / galleryWidth);
      setGalleryIndex((prev) => (prev === next ? prev : next));
    },
    [galleryWidth]
  );

  /**
   * Memoised because paging the gallery calls `setGalleryIndex`, which re-renders
   * this screen. With an inline `renderItem` that re-render rebuilt every page of
   * the pager mid-swipe — the one moment in the app where dropped frames are most
   * visible, since the user is dragging a photo under their finger.
   */
  const renderGalleryItem = useCallback(
    ({ item, index }: { item: PortfolioImage; index: number }) => (
      <Touchable
        onPress={() => {
          haptics.tap();
          setLightboxAt(index);
        }}
        accessibilityRole="imagebutton"
        accessibilityLabel={item.caption || `Portfolio photo ${index + 1} of ${media.length}`}
        accessibilityHint="Opens full screen"
        pressedOpacity={0.92}
      >
        <SmartImage
          uri={item.url}
          thumbnailUri={item.thumbnailUrl}
          // The first frame is above the fold — decode it first.
          priority={index === 0 ? "high" : "normal"}
          style={{ width: galleryWidth, height: galleryHeight }}
          decorative
        />
      </Touchable>
    ),
    [galleryWidth, galleryHeight, media.length]
  );

  /* ---------------------------------------------------------------- states */

  if (isLoading) return <ProfileSkeleton height={galleryHeight} />;

  if (isError || !p) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ErrorState onRetry={refetch} message="We couldn't load this photographer." />
        <Button label="Go back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const isSelf = user?.id === p.userId;

  /* --------------------------------------------------------------- actions */

  const openMessage = async () => {
    setOpening(true);
    try {
      const { id: threadId } = await api<{ id: string }>("/threads", {
        method: "POST",
        body: { photographerId: p.id },
      });
      router.push(`/chat/${threadId}?name=${encodeURIComponent(p.name)}`);
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't open chat", "error");
    } finally {
      setOpening(false);
    }
  };

  const doReport = async () => {
    const ok = await confirm({
      title: "Report this user?",
      message: "Our team reviews reports of harassment, scams, or unsafe behaviour.",
      confirmLabel: "Report",
      destructive: true,
    });
    if (!ok) return;
    try {
      await report.mutateAsync({ targetUserId: p.userId, reason: "OTHER" });
      haptics.success();
      toast("Report submitted — thank you", "success");
    } catch {
      haptics.error();
      toast("Couldn't submit report", "error");
    }
  };

  const doBlock = async () => {
    const ok = await confirm({
      title: `Block ${p.name}?`,
      message: "They won't be able to message you, and you won't see them in Discover.",
      confirmLabel: "Block",
      destructive: true,
    });
    if (!ok) return;
    try {
      await block.mutateAsync({ userId: p.userId, next: true });
      haptics.success();
      toast("Blocked — they can no longer message you", "success");
      router.back();
    } catch {
      haptics.error();
      toast("Couldn't block user", "error");
    }
  };

  const toggleFavorite = () => {
    haptics.tap();
    toggleFav.mutate({ id: p.id, next: !p.isFavorite });
  };

  /* ----------------------------------------------------------------- view */

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: 140 }, contentWidth]}
        // A profile is the screen people sit on while deciding — reviews and
        // availability go stale under them, so it needs a way to pull fresh
        // data without backing out to the feed and navigating in again.
        refreshControl={<RefreshControl {...refreshProps} />}
      >
        {/* Gallery — fixed aspect ratio so nothing reflows as images arrive. */}
        <View accessibilityLabel={`${p.name}'s portfolio, ${media.length} photos`}>
          {media.length > 0 ? (
            <FlatList
              data={media}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(m) => m.id}
              getItemLayout={(_d, i) => ({
                length: galleryWidth,
                offset: galleryWidth * i,
                index: i,
              })}
              onMomentumScrollEnd={(e) => onGalleryScroll(e.nativeEvent.contentOffset.x)}
              renderItem={renderGalleryItem}
              /* A portfolio can run to dozens of full-width photos. Keeping one
                 page either side mounted is enough for a paged swipe and stops
                 the whole set decoding at once on a mid-range Android. */
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
            />
          ) : (
            <View
              style={[styles.galleryEmpty, { width: galleryWidth, height: galleryHeight }]}
              accessible
              accessibilityLabel={`${p.name} hasn't added portfolio photos yet`}
            >
              <Ionicons name="images-outline" size={34} color={t.colors.textFaint} />
              <Text style={styles.galleryEmptyText}>No photos yet</Text>
            </View>
          )}

          {/* Scrim so the white chrome stays legible over a bright photo. */}
          <LinearGradient
            colors={[t.colors.scrimGradientSoft, "transparent"]}
            style={[styles.topScrim, { height: insets.top + 72 }]}
            pointerEvents="none"
          />

          {media.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {media.map((m, i) => (
                <View key={m.id} style={[styles.dot, i === galleryIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.identityRow}>
            <Avatar name={p.name} uri={p.avatarUrl} size={56} ring />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{p.name}</Text>
                {p.isVerified ? <VerifiedBadge /> : null}
              </View>
              <Text style={styles.campus}>{p.campus}</Text>
            </View>
          </View>

          <StatRow
            rating={p.rating}
            completedJobs={p.completedJobs}
            responseTime={p.responseTime}
            stacked={fontScale > 1.3}
          />

          {p.headline ? <Text style={styles.headline}>{p.headline}</Text> : null}
          {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}

          {p.specialties.length > 0 ? (
            <View style={styles.tagsRow}>
              {p.specialties.map((s) => (
                <View key={s} style={styles.tag}>
                  <Text style={styles.tagText} maxFontSizeMultiplier={t.layout.maxFontScale}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Divider />

          <Text style={styles.sectionTitle} accessibilityRole="header">
            Pricing
          </Text>
          <View style={styles.priceCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.priceLabel}>{p.pricing.label}</Text>
              {p.pricing.notes ? <Text style={styles.priceNotes}>{p.pricing.notes}</Text> : null}
            </View>
            {p.pricing.negotiable ? (
              <View style={styles.negotiable}>
                <Text style={styles.negotiableText} maxFontSizeMultiplier={t.layout.maxFontScale}>
                  Negotiable
                </Text>
              </View>
            ) : null}
          </View>

          {p.instagram || p.portfolioUrl ? (
            <View style={styles.linksRow}>
              {p.instagram ? (
                <Button
                  label="Instagram"
                  variant="secondary"
                  icon={<Ionicons name="logo-instagram" size={18} color={t.colors.text} />}
                  onPress={() => Linking.openURL(p.instagram!)}
                  accessibilityHint="Opens Instagram in your browser"
                  style={{ flex: 1 }}
                />
              ) : null}
              {p.portfolioUrl ? (
                <Button
                  label="Portfolio"
                  variant="secondary"
                  icon={<Ionicons name="globe-outline" size={18} color={t.colors.text} />}
                  onPress={() => Linking.openURL(p.portfolioUrl!)}
                  accessibilityHint="Opens their portfolio site in your browser"
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          ) : null}

          <Divider />

          <View style={styles.reviewHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Reviews
            </Text>
            <RatingPill average={p.rating.average} count={p.rating.count} />
          </View>

          {p.reviews.length === 0 ? (
            <Text style={styles.bio}>No reviews yet — be the first after your shoot.</Text>
          ) : (
            p.reviews.map((r) => (
              <View
                key={r.id}
                style={styles.review}
                accessible
                accessibilityLabel={`${r.author} rated ${r.rating} out of 5. ${r.body}`}
              >
                <Avatar name={r.author} uri={r.authorAvatar} size={36} />
                <View style={{ flex: 1 }}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.reviewAuthor} numberOfLines={1}>
                      {r.author}
                    </Text>
                    <View style={styles.reviewStars} importantForAccessibility="no-hide-descendants">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons
                          key={n}
                          name={n <= r.rating ? "star" : "star-outline"}
                          size={12}
                          color={n <= r.rating ? t.colors.star : t.colors.outline}
                        />
                      ))}
                    </View>
                  </View>
                  {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating chrome — fixed, so Back and Save stay reachable at any scroll. */}
      <View style={[styles.topBar, { paddingTop: insets.top + t.spacing.sm }]} pointerEvents="box-none">
        <View style={[styles.topBarInner, contentWidth]} pointerEvents="box-none">
          <Touchable
            onPress={() => router.back()}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={t.colors.onMediaChip} />
          </Touchable>
          <View style={styles.topRight}>
            {!isSelf ? (
              <Touchable
                onPress={() => setMenuOpen(true)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`More options for ${p.name}`}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={t.colors.onMediaChip} />
              </Touchable>
            ) : null}
            <Touchable
              onPress={toggleFavorite}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityState={{ selected: p.isFavorite }}
              accessibilityLabel={p.isFavorite ? `Remove ${p.name} from saved` : `Save ${p.name}`}
            >
              <Ionicons
                name={p.isFavorite ? "heart" : "heart-outline"}
                size={20}
                color={p.isFavorite ? t.colors.accent : t.colors.onMediaChip}
              />
            </Touchable>
          </View>
        </View>
      </View>

      <StickyFooter>
        {isSelf ? (
          <Button
            label="Edit your profile"
            variant="secondary"
            onPress={() => router.push("/(tabs)/profile")}
            full
          />
        ) : (
          <>
            <Button
              label="Message"
              variant="secondary"
              loading={opening}
              onPress={openMessage}
              accessibilityHint={`Starts a conversation with ${p.name}`}
              style={{ flex: 1 }}
            />
            <Button
              label="Request booking"
              haptic="press"
              onPress={() => router.push(`/booking/${p.id}?name=${encodeURIComponent(p.name)}`)}
              accessibilityHint="Opens the booking request form"
              style={{ flex: 1.4 }}
            />
          </>
        )}
      </StickyFooter>

      <Lightbox
        images={media}
        initialIndex={lightboxAt ?? 0}
        visible={lightboxAt != null}
        onClose={() => setLightboxAt(null)}
        title={p.name}
      />

      <ActionSheet
        visible={menuOpen}
        title={p.name}
        message="Keep the community safe"
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: "Report this user", icon: "flag-outline", onPress: doReport },
          { label: "Block", icon: "ban-outline", destructive: true, onPress: doBlock },
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ stats -- */

/**
 * KPI row — three headline numbers, so stat tiles rather than a chart. A
 * one-bar bar chart of "completed jobs" would say less and take more room.
 *
 * Tile contract: sentence-case label, semibold proportional-figure value.
 * Values wear text tokens; only the icons carry hue, and the only hue with
 * meaning here is the rating star. No delta or sparkline: the API exposes no
 * history for these, and inventing a trend line would be a lie.
 *
 * At large accessibility font sizes three tiles across cannot hold their
 * values, so the row becomes a stack.
 */
function StatRow({
  rating,
  completedJobs,
  responseTime,
  stacked,
}: {
  rating: { average: number; count: number };
  completedJobs: number;
  responseTime: string;
  stacked: boolean;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);

  const tiles = [
    {
      key: "rating",
      icon: "star" as const,
      tint: t.colors.star,
      label: "Rating",
      value: rating.count ? rating.average.toFixed(1) : "New",
      sub: rating.count ? `${rating.count} review${rating.count === 1 ? "" : "s"}` : "No reviews yet",
    },
    {
      key: "jobs",
      icon: "camera-outline" as const,
      tint: t.colors.textMuted,
      label: "Shoots done",
      value: String(completedJobs),
      sub: completedJobs === 1 ? "booking completed" : "bookings completed",
    },
    {
      key: "responds",
      icon: "time-outline" as const,
      tint: t.colors.textMuted,
      label: "Responds",
      value: responseTime.replace("Usually replies ", "") || "—",
      sub: "typical reply time",
    },
  ];

  return (
    <View style={[styles.statRow, stacked && { flexDirection: "column" }]}>
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={styles.stat}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}, ${tile.sub}`}
        >
          <Ionicons name={tile.icon} size={15} color={tile.tint} />
          <Text style={styles.statValue} numberOfLines={1}>
            {tile.value}
          </Text>
          <Text style={styles.statLabel} maxFontSizeMultiplier={t.layout.maxFontScale}>
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- skeleton -- */

/** Mirrors the real layout so the page doesn't rearrange when data lands. */
function ProfileSkeleton({ height }: { height: number }) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  return (
    <View style={styles.screen} accessibilityLabel="Loading photographer" accessibilityLiveRegion="polite">
      <View style={contentWidth}>
        <Skeleton height={height} width="100%" radius={0} />
        <View style={[styles.body, { gap: t.spacing.lg }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.md }}>
            <Skeleton height={56} width={56} radius={28} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={20} width="55%" />
              <Skeleton height={13} width="35%" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={72} style={{ flex: 1 }} radius={t.radius.md} />
            ))}
          </View>
          <Skeleton height={16} width="80%" />
          <Skeleton height={13} width="100%" />
          <Skeleton height={13} width="92%" />
          <Skeleton height={13} width="70%" />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  centered: { alignItems: "center", justifyContent: "center", paddingHorizontal: t.spacing.xl },

  galleryEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: t.spacing.sm,
    backgroundColor: t.colors.surfaceMuted,
  },
  galleryEmptyText: { ...t.type.body, color: t.colors.textFaint },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0 },
  dots: {
    position: "absolute",
    bottom: t.spacing.xl + t.spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.mediaDotIdle },
  dotActive: { backgroundColor: t.colors.textOnMedia, width: 18 },

  topBar: { position: "absolute", top: 0, left: 0, right: 0 },
  topBarInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: t.spacing.lg,
  },
  topRight: { flexDirection: "row", gap: t.spacing.sm },
  iconBtn: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.mediaChip,
    alignItems: "center",
    justifyContent: "center",
  },

  body: {
    backgroundColor: t.colors.bg,
    marginTop: -t.spacing["2xl"],
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    padding: t.spacing.xl,
    gap: t.spacing.lg,
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm, flexWrap: "wrap" },
  name: { ...t.type.title, color: t.colors.text },
  campus: { ...t.type.body, color: t.colors.textMuted, marginTop: 2 },

  statRow: { flexDirection: "row", gap: t.spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    gap: 2,
  },
  // Semibold, proportional figures: a standalone value, not a column to align.
  statValue: { ...t.type.h3, color: t.colors.text, marginTop: 4 },
  statLabel: { ...t.type.caption, color: t.colors.textMuted },

  headline: { ...t.type.h3, color: t.colors.text },
  bio: { ...t.type.body, color: t.colors.textMuted },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
  tag: {
    backgroundColor: t.colors.surfaceMuted,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
  },
  tagText: { ...t.type.small, color: t.colors.textMuted, fontWeight: "600" },
  sectionTitle: { ...t.type.h2, color: t.colors.text },

  priceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.spacing.md,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: t.spacing.lg,
  },
  priceLabel: { ...t.type.h3, color: t.colors.text },
  priceNotes: { ...t.type.small, color: t.colors.textMuted, marginTop: 4 },
  negotiable: {
    backgroundColor: t.colors.accentSoft,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
  },
  negotiableText: { ...t.type.small, color: t.colors.onAccentSoft, fontWeight: "700" },
  linksRow: { flexDirection: "row", gap: t.spacing.md },

  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  review: { flexDirection: "row", gap: t.spacing.md, paddingVertical: t.spacing.md },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: t.spacing.sm,
  },
  reviewAuthor: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700", flex: 1 },
  reviewStars: { flexDirection: "row", gap: 1 },
  reviewBody: { ...t.type.body, color: t.colors.textMuted, marginTop: 2 },
});
