import React, { memo, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { useReducedMotion } from "../lib/a11y";

/**
 * The one way images are rendered in SnapCampus.
 *
 * A photography marketplace lives or dies on how photos arrive, so this
 * component fixes the three things that make a gallery feel broken:
 *
 *  1. **No reflow.** The wrapper reserves space from an aspect ratio (or an
 *     explicit height) *before* the bitmap exists, so lists never jump as
 *     images resolve. This is why callers pass `aspectRatio` rather than
 *     letting the image size itself.
 *  2. **Progressive load.** The API already generates a thumbnail for every
 *     upload; we hand it to expo-image as the `placeholder`, so a low-res
 *     frame paints immediately and cross-fades into the full asset. Where no
 *     thumbnail exists we fall back to a neutral tinted tile — never white,
 *     which would flash against dark mode.
 *  3. **Real failure handling.** A dead URL renders a labelled tile instead of
 *     an invisible hole.
 *
 * `memo` matters: these render inside FlatList rows.
 */
export interface SmartImageProps {
  uri?: string | null;
  /** Low-res source shown while the full image decodes (API `thumbnailUrl`). */
  thumbnailUri?: string | null;
  /** Reserve space by ratio. Ignored when the style already fixes a height. */
  aspectRatio?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  /** Corner rounding applied to the clipping wrapper. */
  borderRadius?: number;
  /** Text shown on the fallback tile when there is no image at all. */
  fallbackLabel?: string;
  /** Above-the-fold imagery should decode first. */
  priority?: "low" | "normal" | "high";
  /** Pass the row id in recycled lists so expo-image drops the stale bitmap. */
  recyclingKey?: string;
  accessibilityLabel?: string;
  /** Decorative images (a hero already described by adjacent text). */
  decorative?: boolean;
}

function SmartImageBase({
  uri,
  thumbnailUri,
  aspectRatio,
  contentFit = "cover",
  style,
  borderRadius,
  fallbackLabel,
  priority = "normal",
  recyclingKey,
  accessibilityLabel,
  decorative,
}: SmartImageProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  const wrapper: StyleProp<ViewStyle> = [
    {
      backgroundColor: t.colors.mediaPlaceholder,
      overflow: "hidden",
      ...(aspectRatio ? { aspectRatio } : null),
      ...(borderRadius != null ? { borderRadius } : null),
    },
    style,
  ];

  const showFallback = !uri || failed;

  return (
    <View
      style={wrapper}
      accessible={!decorative && !!accessibilityLabel}
      accessibilityRole={decorative ? "none" : "image"}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
    >
      {showFallback ? (
        <View style={[styles.fill, styles.fallback]}>
          <Ionicons
            name={failed ? "image-outline" : "camera-outline"}
            size={22}
            color={t.colors.textFaint}
          />
          {fallbackLabel ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={t.layout.maxFontScale}
              // `textMuted`, not `textFaint`: this label is usually the
              // photographer's name standing in for their missing hero shot, so
              // it is content rather than chrome and earns the stronger ink.
              style={[t.type.small, { color: t.colors.textMuted, textAlign: "center" }]}
            >
              {fallbackLabel}
            </Text>
          ) : null}
        </View>
      ) : (
        <Image
          source={{ uri }}
          // A thumbnail placeholder is what makes the load feel progressive
          // rather than "blank, then pop".
          placeholder={thumbnailUri ? { uri: thumbnailUri } : undefined}
          placeholderContentFit={contentFit}
          contentFit={contentFit}
          // Cross-fade duration collapses to 0 under reduce-motion.
          transition={reduceMotion ? 0 : t.duration.base}
          priority={priority}
          recyclingKey={recyclingKey}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          style={styles.fill}
          // expo-image renders an <img alt> on web; empty string = decorative.
          alt={decorative ? "" : accessibilityLabel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  fallback: { alignItems: "center", justifyContent: "center", gap: 6, padding: 8 },
});

export const SmartImage = memo(SmartImageBase);
