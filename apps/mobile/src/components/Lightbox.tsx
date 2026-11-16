import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, FlatList, Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { useReducedMotion } from "../lib/a11y";
import { haptics } from "../lib/haptics";
import type { PortfolioImage } from "../types";

const MAX_SCALE = 4;

/**
 * Full-screen portfolio viewer.
 *
 * Deliberately not a library: the interaction budget here is small (page,
 * pinch, double-tap, drag to dismiss) and every dependency that touches the
 * gesture/animation layer is another thing that can break the web export.
 *
 * Sizing comes from `useWindowDimensions` rather than `Dimensions.get()` at
 * module scope, so the pager stays correct when a browser window is resized
 * or a tablet rotates.
 */
export function Lightbox({
  images,
  initialIndex = 0,
  visible,
  onClose,
  title,
}: {
  images: PortfolioImage[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  /** Screen-reader context, e.g. the photographer's name. */
  title?: string;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const onMomentumEnd = useCallback(
    (offsetX: number) => {
      const next = Math.round(offsetX / width);
      setIndex((prev) => {
        if (prev !== next) haptics.selection();
        return next;
      });
    },
    [width]
  );

  // Stable identity so paging (which calls `setIndex`) does not rebuild every
  // mounted page — and with it every zoom/pan gesture handler — mid-swipe.
  const renderPage = useCallback(
    ({ item }: { item: PortfolioImage }) => (
      <ZoomableImage image={item} width={width} height={height} onRequestClose={onClose} />
    ),
    [width, height, onClose]
  );

  const current = images[index];

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      // Draw under the status bar on Android so the viewer is truly full-bleed.
      statusBarTranslucent
      transparent={false}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.root}>
        <FlatList
          data={images}
          keyExtractor={(m) => m.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => onMomentumEnd(e.nativeEvent.contentOffset.x)}
          renderItem={renderPage}
          /* Full-resolution photos at device size: hold one page either side and
             no more, or opening the viewer on a 30-shot portfolio decodes the
             whole set at once. */
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
        />

        {/* Chrome sits above the pager and clears the notch / home indicator. */}
        <View style={[styles.topBar, { paddingTop: insets.top + t.spacing.sm }]}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={t.colors.textOnMedia} />
          </Pressable>
          {images.length > 1 ? (
            <Text
              style={styles.counter}
              maxFontSizeMultiplier={t.layout.maxFontScaleTight}
              accessibilityLabel={`Photo ${index + 1} of ${images.length}${title ? ` by ${title}` : ""}`}
            >
              {index + 1} / {images.length}
            </Text>
          ) : (
            <View />
          )}
          <View style={styles.closeBtn} />
        </View>

        {current?.caption ? (
          <View style={[styles.captionBar, { paddingBottom: insets.bottom + t.spacing.lg }]}>
            <Text style={styles.caption} numberOfLines={3}>
              {current.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ZoomableImage({
  image,
  width,
  height,
  onRequestClose,
}: {
  image: PortfolioImage;
  width: number;
  height: number;
  onRequestClose: () => void;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // A timing config, not a spring: zooming should feel precise, and it
  // collapses to an instant change under reduce-motion.
  const timing = reduceMotion ? { duration: 0 } : { duration: t.duration.base };

  const reset = () => {
    "worklet";
    scale.value = withTiming(1, timing);
    tx.value = withTiming(0, timing);
    ty.value = withTiming(0, timing);
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.8), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1.02) reset();
      else savedScale.value = scale.value;
    });

  // Panning only takes over once the image is actually zoomed in; below that
  // the horizontal pager keeps ownership of the gesture.
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  // Drag down on an un-zoomed photo to dismiss — the gesture people try first.
  const dismiss = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-16, 16])
    .onEnd((e) => {
      if (scale.value <= 1 && e.translationY > 90) runOnJS(onRequestClose)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(2.5, timing);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(
    Gesture.Race(doubleTap, dismiss),
    Gesture.Simultaneous(pinch, pan)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={animatedStyle}>
          <Image
            source={{ uri: image.url }}
            placeholder={image.thumbnailUrl ? { uri: image.thumbnailUrl } : undefined}
            // `contain` is non-negotiable in a viewer: never crop someone's work.
            contentFit="contain"
            placeholderContentFit="contain"
            transition={reduceMotion ? 0 : t.duration.fast}
            style={{ width, height }}
            accessibilityLabel={image.caption || "Portfolio photo"}
            alt={image.caption || "Portfolio photo"}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: t.colors.mediaBackdrop },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.sm,
  },
  closeBtn: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.mediaChip,
  },
  counter: {
    ...t.type.smallStrong,
    color: t.colors.textOnMedia,
    backgroundColor: t.colors.mediaChip,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 6,
    borderRadius: t.radius.pill,
    overflow: "hidden",
  },
  captionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.lg,
    backgroundColor: t.colors.mediaChip,
  },
  caption: { ...t.type.body, color: t.colors.textOnMedia, textAlign: "center" },
});
