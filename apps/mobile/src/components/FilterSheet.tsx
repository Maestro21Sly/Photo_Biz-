import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip } from "./ui";
import { useThemedStyles, type Theme } from "../theme";

export interface DiscoverFilters {
  maxPrice?: number;
  minRating?: number;
}

const PRICES: { label: string; value?: number }[] = [
  { label: "Any", value: undefined },
  { label: "≤ $100", value: 100 },
  { label: "≤ $150", value: 150 },
  { label: "≤ $200", value: 200 },
  { label: "≤ $300", value: 300 },
];
const RATINGS: { label: string; value?: number }[] = [
  { label: "Any", value: undefined },
  { label: "4.0+", value: 4 },
  { label: "4.5+", value: 4.5 },
  { label: "4.8+", value: 4.8 },
];

export function FilterSheet({
  visible,
  initial,
  onApply,
  onClose,
}: {
  visible: boolean;
  initial: DiscoverFilters;
  onApply: (f: DiscoverFilters) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice);
  const [minRating, setMinRating] = useState(initial.minRating);

  useEffect(() => {
    if (visible) {
      setMaxPrice(initial.maxPrice);
      setMinRating(initial.minRating);
    }
  }, [visible, initial.maxPrice, initial.minRating]);

  const activeCount = (maxPrice != null ? 1 : 0) + (minRating != null ? 1 : 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Dim the Android status bar along with everything else behind the sheet.
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close filters"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + styles.sheet.paddingTop }]}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          Filters
        </Text>

        <Text style={styles.label} accessibilityRole="header">
          Max price
        </Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {PRICES.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              active={maxPrice === p.value}
              onPress={() => setMaxPrice(p.value)}
            />
          ))}
        </View>

        <Text style={styles.label} accessibilityRole="header">
          Minimum rating
        </Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {RATINGS.map((r) => (
            <Chip
              key={r.label}
              label={r.label}
              active={minRating === r.value}
              onPress={() => setMinRating(r.value)}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Button
            label="Clear"
            variant="secondary"
            disabled={activeCount === 0}
            onPress={() => {
              setMaxPrice(undefined);
              setMinRating(undefined);
            }}
            style={{ flex: 1 }}
          />
          <Button
            label={activeCount > 0 ? `Apply (${activeCount})` : "Apply"}
            onPress={() => onApply({ maxPrice, minRating })}
            style={{ flex: 1.4 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.colors.scrim },
    sheet: {
      backgroundColor: t.colors.surfaceElevated,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.lg,
      gap: t.spacing.md,
      // Centred and capped so a browser doesn't get a full-width sheet.
      width: "100%",
      maxWidth: t.layout.sheetMaxWidth,
      alignSelf: "center",
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.colors.outline,
      marginBottom: t.spacing.sm,
    },
    title: { ...t.type.h2, color: t.colors.text },
    label: { ...t.type.small, color: t.colors.textMuted, fontWeight: "700", marginTop: t.spacing.sm },
    row: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
    actions: { flexDirection: "row", gap: t.spacing.md, marginTop: t.spacing.lg },
  });
