import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Touchable } from "../../src/components/ui";
import { KeyboardScreen, ScreenHeader, useContentWidth } from "../../src/components/Screen";
import { DatePicker } from "../../src/components/DatePicker";
import { MapPicker, type LatLng } from "../../src/components/MapPicker";
import { useToast } from "../../src/components/Toast";
import { api, ApiError } from "../../src/lib/api";
import { haptics } from "../../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const EVENT_TYPES = ["Graduation", "Portraits", "Event", "Headshots", "Couples", "Other"];

type FieldErrors = { type?: string; date?: string; location?: string };

export default function BookingRequest() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const { photographerId, name } = useLocalSearchParams<{ photographerId: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const [eventType, setEventType] = useState("Graduation");
  const [customType, setCustomType] = useState("");
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [duration, setDuration] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolvedType = eventType === "Other" ? customType.trim() : eventType;

  const submit = async () => {
    setError(null);

    // Field-level errors put the message next to the control that's wrong,
    // rather than a single line at the bottom the user has to map back.
    const next: FieldErrors = {};
    if (eventType === "Other" && !customType.trim()) next.type = "Tell us what kind of shoot it is.";
    if (!eventDate) next.date = "Pick a date and time for the shoot.";
    if (!location.trim()) next.location = "Add a location (and drop a pin if you can).";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      haptics.warn();
      return;
    }

    setLoading(true);
    try {
      await api("/bookings", {
        method: "POST",
        body: {
          photographerId,
          eventType: resolvedType,
          eventDate: eventDate!.toISOString(),
          location: location.trim(),
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          durationHours: duration ? Number(duration) : undefined,
          message: message.trim() || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      haptics.success();
      toast("Request sent — they'll get a notification", "success");
      router.back();
      router.push("/(tabs)/bookings");
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError ? e.message : "Couldn't send request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardScreen>
      <ScreenHeader
        title="Request a booking"
        subtitle={name ? `with ${name}` : undefined}
        onBack={() => router.back()}
        backIcon="close"
        backLabel="Close"
        bordered={false}
      />

      <ScrollView
        contentContainerStyle={[styles.body, contentWidth, { paddingBottom: insets.bottom + 44 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label} accessibilityRole="header">
          What's the shoot?
        </Text>
        <View style={styles.typeRow} accessibilityRole="radiogroup">
          {EVENT_TYPES.map((type) => {
            const active = eventType === type;
            return (
              <Touchable
                key={type}
                onPress={() => {
                  haptics.selection();
                  setEventType(type);
                  setErrors((e) => ({ ...e, type: undefined }));
                }}
                style={[styles.typeChip, active && styles.typeChipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={type}
                pressedOpacity={0.75}
              >
                <Text
                  style={[styles.typeChipText, active && { color: t.colors.onAccent }]}
                  maxFontSizeMultiplier={t.layout.maxFontScale}
                >
                  {type}
                </Text>
              </Touchable>
            );
          })}
        </View>

        {eventType === "Other" ? (
          <Field
            label="Describe your shoot"
            value={customType}
            onChangeText={(v) => {
              setCustomType(v);
              setErrors((e) => ({ ...e, type: undefined }));
            }}
            placeholder="e.g. Sorority formal, product shots, band promo…"
            error={errors.type}
          />
        ) : null}

        <Text style={styles.label} accessibilityRole="header">
          When?
        </Text>
        <DatePicker
          value={eventDate}
          onChange={(d) => {
            setEventDate(d);
            setErrors((e) => ({ ...e, date: undefined }));
          }}
          error={Boolean(errors.date)}
        />
        {errors.date ? (
          <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {errors.date}
          </Text>
        ) : null}

        <Text style={styles.label} accessibilityRole="header">
          Where?
        </Text>
        <Field
          value={location}
          onChangeText={(v) => {
            setLocation(v);
            setErrors((e) => ({ ...e, location: undefined }));
          }}
          placeholder="South Quad, main lawn"
          accessibilityLabel="Shoot location"
          error={errors.location}
        />
        <MapPicker value={coords} onChange={setCoords} />

        <Field
          label="Duration in hours (optional)"
          value={duration}
          onChangeText={setDuration}
          placeholder="2"
          keyboardType="number-pad"
        />
        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          placeholder="Tell them your vision, group size, etc."
          multiline
          style={{ minHeight: 110, paddingTop: t.spacing.md, textAlignVertical: "top" }}
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button
          label="Send request"
          onPress={submit}
          loading={loading}
          haptic="press"
          full
          style={{ marginTop: t.spacing.sm }}
        />
        <Text style={styles.hint}>
          No payment now — this sends a request and opens a chat with the photographer.
        </Text>
      </ScrollView>
    </KeyboardScreen>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    body: { paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md, gap: t.spacing.md },
    label: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700", marginTop: t.spacing.sm },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
    typeChip: {
      paddingHorizontal: t.spacing.lg,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    typeChipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    typeChipText: { ...t.type.small, color: t.colors.text, fontWeight: "600" },
    fieldError: { ...t.type.small, color: t.colors.danger, marginLeft: 2 },
    error: { ...t.type.small, color: t.colors.danger },
    hint: { ...t.type.small, color: t.colors.textFaint, textAlign: "center", marginTop: t.spacing.sm },
  });
