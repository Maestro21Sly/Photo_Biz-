import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Touchable } from "./ui";
import { haptics } from "../lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Bookable times, on the hour, 7am–9pm.
const TIMES = Array.from({ length: 15 }, (_, i) => 7 + i);
const DAYS_AHEAD = 60;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
function labelTime(h: number) {
  const am = h < 12;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${am ? "AM" : "PM"}`;
}

/**
 * Compact date+time picker: a horizontal strip of the next ~60 days plus an
 * hour selector. Deliberately not the OS picker — a native modal spinner can't
 * show which slots are already in the past, and it looks different on every
 * platform including web, where there is no native picker at all.
 */
export function DatePicker({
  value,
  onChange,
  error,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  error?: boolean;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const today = startOfDay(new Date());
  const [open, setOpen] = useState(false);
  const nowHour = new Date().getHours();

  const days = useMemo(
    () =>
      Array.from(
        { length: DAYS_AHEAD },
        (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today.getTime()]
  );

  const selectedHour = value ? value.getHours() : null;
  const isToday = value ? sameDay(value, today) : false;

  const pickDay = (day: Date) => {
    haptics.selection();
    const next = new Date(day);
    next.setHours(value ? value.getHours() : 12, 0, 0, 0);
    onChange(next);
  };
  const pickTime = (h: number) => {
    haptics.selection();
    const base = value ?? today;
    const next = new Date(base);
    next.setHours(h, 0, 0, 0);
    onChange(next);
  };

  const display = value
    ? `${WEEKDAYS[value.getDay()]} ${MONTHS[value.getMonth()]} ${value.getDate()} · ${labelTime(value.getHours())}`
    : "Select a date & time";

  return (
    <View>
      <Touchable
        onPress={() => {
          haptics.tap();
          setOpen((o) => !o);
        }}
        style={[styles.field, error ? styles.fieldError : null]}
        accessibilityRole="button"
        accessibilityLabel={value ? `Shoot date and time: ${display}` : "Select a date and time"}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Collapses the day and time picker" : "Expands the day and time picker"}
      >
        <Ionicons name="calendar-outline" size={18} color={t.colors.textMuted} />
        <Text style={[styles.fieldText, !value && { color: t.colors.textFaint }]} numberOfLines={2}>
          {display}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={t.colors.textMuted} />
      </Touchable>

      {open ? (
        <View style={styles.panel}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            keyboardShouldPersistTaps="handled"
          >
            {days.map((day) => {
              const active = value ? sameDay(day, value) : false;
              return (
                <Touchable
                  key={day.toISOString()}
                  onPress={() => pickDay(day)}
                  style={[styles.dayPill, active && styles.dayPillActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={day.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  pressedOpacity={0.7}
                >
                  <Text
                    style={[styles.dayWeek, active && styles.activeText]}
                    maxFontSizeMultiplier={t.layout.maxFontScaleTight}
                  >
                    {WEEKDAYS[day.getDay()]}
                  </Text>
                  <Text
                    style={[styles.dayNum, active && styles.activeText]}
                    maxFontSizeMultiplier={t.layout.maxFontScaleTight}
                  >
                    {day.getDate()}
                  </Text>
                  <Text
                    style={[styles.dayMonth, active && styles.activeText]}
                    maxFontSizeMultiplier={t.layout.maxFontScaleTight}
                  >
                    {MONTHS[day.getMonth()]}
                  </Text>
                </Touchable>
              );
            })}
          </ScrollView>

          <Text style={styles.timeHeading} accessibilityRole="header">
            Start time
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeRow}
            keyboardShouldPersistTaps="handled"
          >
            {TIMES.map((h) => {
              // Hours that have already passed today can't be booked.
              const disabled = isToday && h <= nowHour;
              const active = selectedHour === h;
              return (
                <Touchable
                  key={h}
                  disabled={disabled}
                  onPress={() => pickTime(h)}
                  style={[styles.timeChip, active && styles.timeChipActive, disabled && { opacity: 0.35 }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled }}
                  accessibilityLabel={disabled ? `${labelTime(h)}, already passed` : labelTime(h)}
                  pressedOpacity={0.7}
                >
                  <Text
                    style={[styles.timeChipText, active && styles.activeText]}
                    maxFontSizeMultiplier={t.layout.maxFontScale}
                  >
                    {labelTime(h)}
                  </Text>
                </Touchable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.sm,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      minHeight: 52,
    },
    fieldError: { borderColor: t.colors.danger, borderWidth: 1.5 },
    fieldText: { flex: 1, ...t.type.body, color: t.colors.text },
    panel: { marginTop: t.spacing.sm, gap: t.spacing.sm },
    strip: { gap: t.spacing.sm, paddingVertical: 2, paddingRight: t.spacing.lg },
    dayPill: {
      minWidth: 56,
      paddingHorizontal: t.spacing.xs,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      gap: 1,
    },
    dayPillActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    dayWeek: { ...t.type.caption, color: t.colors.textMuted },
    dayNum: { ...t.type.h3, color: t.colors.text },
    dayMonth: { ...t.type.caption, color: t.colors.textFaint },
    activeText: { color: t.colors.onAccent },
    timeHeading: {
      ...t.type.small,
      color: t.colors.textMuted,
      fontWeight: "700",
      marginTop: t.spacing.xs,
    },
    timeRow: { gap: t.spacing.sm, paddingRight: t.spacing.lg },
    timeChip: {
      paddingHorizontal: t.spacing.md,
      minHeight: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    timeChipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    timeChipText: { ...t.type.small, color: t.colors.text, fontWeight: "600" },
  });
