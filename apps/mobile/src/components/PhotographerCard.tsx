import React, { memo, useCallback, useEffect, useRef } from "react";
import { StyleSheet, Animated, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { useReducedMotion } from "../lib/a11y";
import { haptics } from "../lib/haptics";
import { Avatar, RatingPill, VerifiedBadge } from "./ui";
import { SmartImage } from "./SmartImage";
import type { Photographer } from "../types";

/**
 * Feed card. This is the app's most-rendered component, so:
 *  - it is memoised and its callbacks are stable at the call site;
 *  - the hero reserves space by aspect ratio, so nothing reflows on load;
 *  - the whole card is a single accessibility element with one summarising
 *    label, rather than eight separate stops a screen-reader user must swipe
 *    through to learn one photographer's name and price.
 */
function PhotographerCardBase({
  photographer: p,
  onPress,
  onToggleFavorite,
}: {
  photographer: Photographer;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();

  const hero = p.media[0];
  const strip = p.media.slice(1, 4);
  const responds = p.responseTime.replace("Usually replies ", "");

  const summary = [
    p.name,
    p.isVerified ? "verified" : null,
    p.campus,
    p.rating.count ? `rated ${p.rating.average.toFixed(1)} from ${p.rating.count} reviews` : "no reviews yet",
    p.pricing.label,
    p.headline || null,
  ]
    .filter(Boolean)
    .join(", ");

  const toggle = useCallback(() => {
    haptics.tap();
    onToggleFavorite();
  }, [onToggleFavorite]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Opens this photographer's profile"
      style={({ pressed }) => [
        styles.card,
        pressed && !reduceMotion ? { transform: [{ scale: 0.995 }] } : null,
        pressed ? { opacity: 0.96 } : null,
      ]}
    >
      <View>
        <SmartImage
          uri={hero?.url}
          thumbnailUri={hero?.thumbnailUrl}
          aspectRatio={t.aspect.hero}
          recyclingKey={p.id}
          fallbackLabel={p.name}
          // Described by the card's own label; announcing it twice is noise.
          decorative
        />

        {/* A scrim, not a solid chip: keeps the photo readable underneath while
            guaranteeing the price stays legible over a bright sky or a wall. */}
        <LinearGradient
          colors={["transparent", t.colors.scrimGradientStrong]}
          style={styles.scrim}
          pointerEvents="none"
        />

        <View style={styles.priceTag} pointerEvents="none">
          <Text
            style={styles.priceTagText}
            numberOfLines={1}
            maxFontSizeMultiplier={t.layout.maxFontScale}
          >
            {p.pricing.label}
          </Text>
        </View>

        <FavoriteButton active={p.isFavorite} name={p.name} onPress={toggle} />
      </View>

      {strip.length > 0 ? (
        <View style={styles.strip}>
          {strip.map((m) => (
            <SmartImage
              key={m.id}
              uri={m.url}
              thumbnailUri={m.thumbnailUrl}
              style={styles.stripImg}
              recyclingKey={m.id}
              decorative
            />
          ))}
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.identityRow}>
          <Avatar name={p.name} uri={p.avatarUrl} size={40} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              {p.isVerified ? <VerifiedBadge /> : null}
            </View>
            <Text style={styles.campus} numberOfLines={1}>
              {p.distanceKm != null ? `${p.distanceKm} km · ` : ""}
              {p.campus}
              {responds ? ` · ${responds}` : ""}
            </Text>
          </View>
          <RatingPill average={p.rating.average} count={p.rating.count} />
        </View>

        {p.headline ? (
          <Text style={styles.headline} numberOfLines={2}>
            {p.headline}
          </Text>
        ) : null}

        {p.specialties.length > 0 ? (
          <View style={styles.tagsRow}>
            {p.specialties.slice(0, 3).map((s) => (
              <View key={s} style={styles.tag}>
                <Text style={styles.tagText} maxFontSizeMultiplier={t.layout.maxFontScale}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Heart with a pop on activate — the micro-interaction that sells optimism. */
function FavoriteButton({
  active,
  name,
  onPress,
}: {
  active: boolean;
  name: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    // Skip the animation on mount, and entirely under reduce-motion.
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion || !active) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.28, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
    ]).start();
  }, [active, reduceMotion, scale]);

  return (
    <Pressable
      onPress={onPress}
      // The visual button is 38pt; hit-slop takes the target past 44pt.
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={active ? `Remove ${name} from saved` : `Save ${name}`}
      accessibilityState={{ selected: active }}
      style={styles.heart}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={active ? "heart" : "heart-outline"}
          size={20}
          color={active ? t.colors.accent : t.colors.onMediaChip}
        />
      </Animated.View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: t.colors.border,
    ...t.shadow.card,
  },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  heart: {
    position: "absolute",
    top: t.spacing.md,
    right: t.spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.colors.mediaChip,
    alignItems: "center",
    justifyContent: "center",
  },
  priceTag: {
    position: "absolute",
    bottom: t.spacing.md,
    left: t.spacing.md,
    maxWidth: "70%",
  },
  priceTagText: {
    ...t.type.smallStrong,
    color: t.colors.textOnMedia,
    // A shadow rather than a chip: the gradient does the heavy lifting and the
    // photo stays uninterrupted.
    textShadowColor: t.colors.mediaTextShadow,
    textShadowRadius: 6,
    fontSize: 15,
  },

  strip: { flexDirection: "row", gap: 2 },
  stripImg: { flex: 1, height: 76 },

  body: { padding: t.spacing.lg, gap: t.spacing.md },
  identityRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm, flexWrap: "wrap" },
  name: { ...t.type.h3, color: t.colors.text, flexShrink: 1 },
  campus: { ...t.type.small, color: t.colors.textMuted, marginTop: 1 },
  headline: { ...t.type.body, color: t.colors.textMuted },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
  tag: {
    backgroundColor: t.colors.surfaceMuted,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 5,
    borderRadius: t.radius.pill,
  },
  tagText: { ...t.type.small, color: t.colors.textMuted, fontWeight: "600" },
});

export const PhotographerCard = memo(PhotographerCardBase);

/**
 * List-row wrapper for feeds.
 *
 * `renderItem` closures are recreated on every parent render, which would
 * defeat `memo` on the card itself. Passing id-keyed handlers down instead
 * keeps this component's props referentially stable, so scrolling a long feed
 * re-renders nothing that hasn't changed.
 */
export const FeedCard = memo(function FeedCard({
  item,
  onOpen,
  onToggle,
}: {
  item: Photographer;
  onOpen: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
}) {
  const open = useCallback(() => onOpen(item.id), [item.id, onOpen]);
  const toggle = useCallback(() => onToggle(item.id, !item.isFavorite), [item.id, item.isFavorite, onToggle]);
  return <PhotographerCard photographer={item} onPress={open} onToggleFavorite={toggle} />;
});
