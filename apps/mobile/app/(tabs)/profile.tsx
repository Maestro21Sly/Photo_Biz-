import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type SwitchProps,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Button,
  Chip,
  Divider,
  ErrorState,
  Field,
  Skeleton,
  Touchable,
} from "../../src/components/ui";
import { KeyboardScreen, useContentWidth } from "../../src/components/Screen";
import { SmartImage } from "../../src/components/SmartImage";
import { Lightbox } from "../../src/components/Lightbox";
import { useToast } from "../../src/components/Toast";
import { MapPicker, type LatLng } from "../../src/components/MapPicker";
import { useAuth } from "../../src/lib/auth";
import { api, ApiError } from "../../src/lib/api";
import { confirm } from "../../src/lib/confirm";
import { haptics } from "../../src/lib/haptics";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { Photographer } from "../../src/types";

/** Picks one image and uploads it. Returns false when the user cancels. */
async function pickAndUpload(endpoint: string, extra?: Record<string, string>): Promise<boolean> {
  const res = await ImagePicker.launchImageLibraryAsync({
    // Array form; `MediaTypeOptions` is deprecated as of SDK 52.
    mediaTypes: ["images"],
    quality: 0.85,
  });
  if (res.canceled || !res.assets[0]) return false;
  const asset = res.assets[0];
  const fd = new FormData();
  fd.append("file", {
    uri: asset.uri,
    name: asset.fileName ?? "photo.jpg",
    type: asset.mimeType ?? "image/jpeg",
  } as unknown as Blob);
  for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
  await api(endpoint, { method: "POST", form: fd });
  return true;
}

export default function Profile() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isPhotographer = user?.role === "PHOTOGRAPHER";

  return (
    <KeyboardScreen>
      <ScrollView
        contentContainerStyle={[
          contentWidth,
          { paddingTop: insets.top + t.spacing.md, paddingBottom: insets.bottom + 44 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Profile
          </Text>
          <Touchable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.gear}
          >
            <Ionicons name="settings-outline" size={22} color={t.colors.text} />
          </Touchable>
        </View>

        <AccountSection />
        {isPhotographer ? <PhotographerEditor /> : <StudentFooter />}
      </ScrollView>
    </KeyboardScreen>
  );
}

/* -------------------------------------------------------------- account -- */

function AccountSection() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: { displayName: displayName.trim(), phone: phone.trim() || null },
      });
      await refresh();
      haptics.success();
      toast("Account updated", "success");
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async () => {
    setUploading(true);
    try {
      if (await pickAndUpload("/media/avatar")) {
        await refresh();
        haptics.success();
        toast("Photo updated", "success");
      }
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.avatarRow}>
        <Touchable
          onPress={changeAvatar}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityState={{ busy: uploading }}
          style={{ borderRadius: 36 }}
        >
          <Avatar name={user?.displayName ?? "?"} uri={user?.avatarUrl} size={72} />
          <View style={styles.avatarEdit}>
            <Ionicons
              name={uploading ? "ellipsis-horizontal" : "camera"}
              size={14}
              color={t.colors.onAccent}
            />
          </View>
        </Touchable>
        <View style={{ flex: 1, gap: t.spacing.sm }}>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email}
          </Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleText} maxFontSizeMultiplier={t.layout.maxFontScale}>
              {user?.role === "PHOTOGRAPHER" ? "Photographer" : "Student"}
            </Text>
          </View>
        </View>
      </View>

      <Field
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        placeholder="(555) 555-1234"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <Button label="Save account" variant="secondary" onPress={save} loading={saving} full />
    </View>
  );
}

/** Gives students something at the bottom of an otherwise very short screen. */
function StudentFooter() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Divider />
      <View style={styles.promoCard}>
        <Text style={styles.promoTitle}>Shoot for other students?</Text>
        <Text style={styles.promoBody}>
          Photographer accounts get a portfolio, pricing and booking requests. Ask support to switch
          your account over.
        </Text>
        <Button
          label="Browse photographers"
          variant="secondary"
          onPress={() => router.push("/(tabs)")}
          full
        />
      </View>
    </View>
  );
}

/* --------------------------------------------------------- photographer -- */

const MODELS: { key: "HOURLY" | "PACKAGE" | "CUSTOM"; label: string }[] = [
  { key: "HOURLY", label: "Hourly" },
  { key: "PACKAGE", label: "Package" },
  { key: "CUSTOM", label: "Custom" },
];

function PhotographerEditor() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const qc = useQueryClient();
  const toast = useToast();
  const {
    data: profile,
    refetch,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => api<Photographer>("/photographers/me"),
  });

  const [form, setForm] = useState({
    campus: "",
    headline: "",
    bio: "",
    pricingModel: "CUSTOM" as "HOURLY" | "PACKAGE" | "CUSTOM",
    priceLabel: "",
    hourlyRate: "",
    startingAt: "",
    minimumHours: "",
    negotiable: false,
    pricingNotes: "",
    responseTime: "",
    specialties: "",
    instagram: "",
    portfolioUrl: "",
    isPublished: false,
  });
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);

  const hydrate = useCallback((p: Photographer) => {
    setForm({
      campus: p.campus,
      headline: p.headline,
      bio: p.bio,
      pricingModel: p.pricing.model,
      priceLabel: p.pricing.label,
      hourlyRate: p.pricing.hourlyRate?.toString() ?? "",
      startingAt: p.pricing.startingAt?.toString() ?? "",
      minimumHours: p.pricing.minimumHours?.toString() ?? "",
      negotiable: p.pricing.negotiable,
      pricingNotes: p.pricing.notes,
      responseTime: p.responseTime,
      specialties: p.specialties.join(", "),
      instagram: p.instagram ?? "",
      portfolioUrl: p.portfolioUrl ?? "",
      isPublished: p.isPublished,
    });
    setCoords(p.location);
  }, []);

  /**
   * Fill the form from the server **once**, then leave it alone.
   *
   * React Query refetches on window focus, so the naive `useEffect([profile])`
   * meant: type half a bio, switch to another browser tab or background the
   * app, come back — and every field silently reverted to the last saved copy.
   * Anything the user has typed since is theirs until they save. `save()`
   * re-hydrates explicitly from the write response so canonical server values
   * (trimmed strings, coerced numbers) still land.
   */
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    if (profile && hydratedId.current !== profile.id) {
      hydratedId.current = profile.id;
      hydrate(profile);
    }
  }, [profile, hydrate]);

  const num = (v: string) => (v.trim() ? Number(v) : null);

  const save = async () => {
    setSaving(true);
    try {
      await api("/photographers/me", {
        method: "PUT",
        body: {
          campus: form.campus,
          headline: form.headline,
          bio: form.bio,
          pricingModel: form.pricingModel,
          priceLabel: form.priceLabel,
          hourlyRate: num(form.hourlyRate),
          startingAt: num(form.startingAt),
          minimumHours: num(form.minimumHours),
          negotiable: form.negotiable,
          pricingNotes: form.pricingNotes,
          responseTime: form.responseTime,
          instagram: form.instagram || null,
          portfolioUrl: form.portfolioUrl || null,
          isPublished: form.isPublished,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          specialties: form.specialties
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      // Re-hydrate from the authoritative copy so any server-side normalisation
      // is reflected — the one place overwriting the form is correct.
      const fresh = await refetch();
      if (fresh.data) hydrate(fresh.data);
      qc.invalidateQueries({ queryKey: ["photographers"] });
      haptics.success();
      toast("Profile saved", "success");
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = async () => {
    setUploading(true);
    try {
      if (await pickAndUpload("/media/portfolio")) {
        await refetch();
        qc.invalidateQueries({ queryKey: ["photographers"] });
        haptics.success();
        toast("Photo added", "success");
      }
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: "Remove this photo?",
        message: "It disappears from your portfolio straight away.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
      try {
        await api(`/media/portfolio/${id}`, { method: "DELETE" });
        await refetch();
        qc.invalidateQueries({ queryKey: ["photographers"] });
        haptics.success();
      } catch {
        haptics.error();
        toast("Couldn't remove photo", "error");
      }
    },
    [refetch, qc, toast]
  );

  const requestVerification = async () => {
    setRequesting(true);
    try {
      await api("/photographers/me/request-verification", { method: "POST" });
      await refetch();
      haptics.success();
      toast("Verification requested", "success");
    } catch (e) {
      haptics.error();
      toast(e instanceof ApiError ? e.message : "Couldn't request", "error");
    } finally {
      setRequesting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.section, { gap: t.spacing.md }]}>
        <Divider />
        <Skeleton height={64} width="100%" radius={t.radius.md} />
        <Skeleton height={72} width="100%" radius={t.radius.md} />
        <Skeleton height={52} width="100%" radius={t.radius.md} />
        <Skeleton height={52} width="100%" radius={t.radius.md} />
        <Skeleton height={100} width="100%" radius={t.radius.md} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <Divider />
        <ErrorState onRetry={refetch} message="We couldn't load your photographer profile." />
      </View>
    );
  }

  const status = profile?.verificationStatus ?? "NONE";
  const media = profile?.media ?? [];

  return (
    <View style={styles.section}>
      <Divider />

      {!form.isPublished ? (
        <View style={styles.draftBanner} accessible accessibilityLabel="Draft. Students can't find you until you publish.">
          <Ionicons name="eye-off-outline" size={18} color={t.colors.onWarnSoft} />
          <Text style={styles.draftText}>
            You're in draft — students can't find you until you publish.
          </Text>
        </View>
      ) : null}

      <View style={styles.publishRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.publishTitle}>Published</Text>
          <Text style={styles.publishHint}>When on, students can find you in Discover.</Text>
        </View>
        <ThemedSwitch
          value={form.isPublished}
          onValueChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
          label="Published"
        />
      </View>

      {/* Verification */}
      <View style={styles.verifyCard}>
        <Ionicons
          name={status === "VERIFIED" ? "checkmark-circle" : status === "PENDING" ? "time" : "shield-outline"}
          size={20}
          color={status === "VERIFIED" ? t.colors.success : t.colors.textMuted}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.verifyTitle}>
            {status === "VERIFIED"
              ? "Verified photographer"
              : status === "PENDING"
                ? "Verification pending"
                : status === "REJECTED"
                  ? "Not approved yet"
                  : "Get verified"}
          </Text>
          <Text style={styles.verifyHint}>
            {status === "VERIFIED"
              ? "Students see a verified badge on your profile."
              : "Verified photographers rank higher and earn more trust."}
          </Text>
        </View>
        {status === "NONE" || status === "REJECTED" ? (
          <Button
            label="Request"
            variant="secondary"
            size="sm"
            onPress={requestVerification}
            loading={requesting}
          />
        ) : null}
      </View>

      <Text style={styles.editTitle} accessibilityRole="header">
        Your profile
      </Text>
      <Field
        label="Campus area"
        value={form.campus}
        onChangeText={(v) => setForm((f) => ({ ...f, campus: v }))}
        placeholder="North Campus"
      />
      <Field
        label="Headline"
        value={form.headline}
        onChangeText={(v) => setForm((f) => ({ ...f, headline: v }))}
        placeholder="Warm graduation & portrait photography"
      />
      <Field
        label="Bio"
        value={form.bio}
        onChangeText={(v) => setForm((f) => ({ ...f, bio: v }))}
        placeholder="Tell students about your style…"
        multiline
        style={{ minHeight: 100, paddingTop: t.spacing.md, textAlignVertical: "top" }}
      />
      <Field
        label="Specialties"
        hint="Comma-separated, e.g. Graduation, Portraits, Events"
        value={form.specialties}
        onChangeText={(v) => setForm((f) => ({ ...f, specialties: v }))}
        placeholder="Graduation, Portraits, Events"
      />
      <Field
        label="Typical response time"
        value={form.responseTime}
        onChangeText={(v) => setForm((f) => ({ ...f, responseTime: v }))}
        placeholder="Usually replies within 2 hours"
      />

      {/* Pricing */}
      <Text style={styles.editTitle} accessibilityRole="header">
        Pricing
      </Text>
      <View style={styles.modelRow} accessibilityRole="radiogroup">
        {MODELS.map((m) => (
          <Chip
            key={m.key}
            label={m.label}
            active={form.pricingModel === m.key}
            onPress={() => setForm((f) => ({ ...f, pricingModel: m.key }))}
          />
        ))}
      </View>
      <Field
        label="Display price label"
        hint="This is what students see on your card."
        value={form.priceLabel}
        onChangeText={(v) => setForm((f) => ({ ...f, priceLabel: v }))}
        placeholder="$140/hr or Starting at $200"
      />
      {form.pricingModel === "HOURLY" ? (
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field
              label="Hourly rate ($)"
              value={form.hourlyRate}
              onChangeText={(v) => setForm((f) => ({ ...f, hourlyRate: v }))}
              placeholder="140"
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Min hours"
              value={form.minimumHours}
              onChangeText={(v) => setForm((f) => ({ ...f, minimumHours: v }))}
              placeholder="1"
              keyboardType="number-pad"
            />
          </View>
        </View>
      ) : null}
      {form.pricingModel === "PACKAGE" ? (
        <Field
          label="Starting at ($)"
          value={form.startingAt}
          onChangeText={(v) => setForm((f) => ({ ...f, startingAt: v }))}
          placeholder="200"
          keyboardType="number-pad"
        />
      ) : null}
      <View style={styles.publishRow}>
        <Text style={[styles.publishTitle, { flex: 1 }]}>Open to negotiation</Text>
        <ThemedSwitch
          value={form.negotiable}
          onValueChange={(v) => setForm((f) => ({ ...f, negotiable: v }))}
          label="Open to negotiation"
        />
      </View>
      <Field
        label="Pricing notes"
        value={form.pricingNotes}
        onChangeText={(v) => setForm((f) => ({ ...f, pricingNotes: v }))}
        placeholder="Custom packages for groups, etc."
        multiline
        style={{ minHeight: 70, paddingTop: t.spacing.md, textAlignVertical: "top" }}
      />

      <Field
        label="Instagram URL"
        value={form.instagram}
        onChangeText={(v) => setForm((f) => ({ ...f, instagram: v }))}
        placeholder="https://instagram.com/you"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Field
        label="Portfolio URL"
        value={form.portfolioUrl}
        onChangeText={(v) => setForm((f) => ({ ...f, portfolioUrl: v }))}
        placeholder="https://yoursite.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <MapPicker label="Your base / where you shoot" value={coords} onChange={setCoords} />

      <Button label="Save profile" onPress={save} loading={saving} haptic="press" full />

      <Divider />

      {/* Portfolio */}
      <View style={styles.portfolioHeader}>
        <Text style={styles.editTitle} accessibilityRole="header">
          Portfolio
        </Text>
        <Touchable
          onPress={addPhoto}
          disabled={uploading}
          style={styles.addPhoto}
          accessibilityRole="button"
          accessibilityLabel={uploading ? "Uploading photo" : "Add portfolio photo"}
          accessibilityState={{ busy: uploading, disabled: uploading }}
        >
          <Ionicons name="add" size={18} color={t.colors.accentText} />
          <Text style={styles.addPhotoText}>{uploading ? "Uploading…" : "Add photo"}</Text>
        </Touchable>
      </View>

      {media.length === 0 ? (
        <View style={styles.portfolioEmpty}>
          <Ionicons name="images-outline" size={26} color={t.colors.textFaint} />
          <Text style={styles.portfolioEmptyText}>
            Your work is the first thing students judge. Add at least three photos before you
            publish.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {media.map((m, index) => (
            <View key={m.id} style={styles.gridItem}>
              <Touchable
                onPress={() => setLightboxAt(index)}
                accessibilityRole="imagebutton"
                accessibilityLabel={m.caption || `Portfolio photo ${index + 1}`}
                accessibilityHint="Opens full screen"
                style={{ flex: 1 }}
                pressedOpacity={0.9}
              >
                <SmartImage
                  uri={m.url}
                  thumbnailUri={m.thumbnailUrl}
                  aspectRatio={t.aspect.square}
                  recyclingKey={m.id}
                  decorative
                />
              </Touchable>
              <Touchable
                onPress={() => deletePhoto(m.id)}
                style={styles.gridDelete}
                size={26}
                accessibilityRole="button"
                accessibilityLabel={`Remove portfolio photo ${index + 1}`}
              >
                <Ionicons name="close" size={15} color={t.colors.onMediaChip} />
              </Touchable>
            </View>
          ))}
        </View>
      )}

      <Lightbox
        images={media}
        initialIndex={lightboxAt ?? 0}
        visible={lightboxAt != null}
        onClose={() => setLightboxAt(null)}
      />
    </View>
  );
}

/**
 * `Switch` needs different props per platform to look right.
 *
 * iOS draws a white knob itself and tints only the track, so `thumbColor` is
 * left alone there. Android and react-native-web both pick their own knob
 * colour otherwise — Android's grey knob disappears against a dark off-track,
 * and RN-Web reads `thumbColor` for the OFF state only, falling back to
 * `activeThumbColor` (default Material teal, #009688) once the switch is on.
 * That put a green thumb on the "Published" toggle in the web build.
 *
 * A fixed white knob is the one value that stays visible on all four track
 * states (light/dark x on/off) and matches the platform convention.
 */
function ThemedSwitch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  const t = useTheme();
  // `activeThumbColor` exists only in react-native-web and is absent from RN's
  // SwitchProps, so it has to be spread in rather than passed as a named prop.
  const webThumb =
    Platform.OS === "web"
      ? ({ activeThumbColor: t.colors.textOnMedia } as unknown as SwitchProps)
      : null;

  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        haptics.selection();
        onValueChange(v);
      }}
      accessibilityLabel={label}
      accessibilityRole="switch"
      trackColor={{ false: t.colors.surfaceSunken, true: t.colors.accent }}
      thumbColor={Platform.OS === "ios" ? undefined : t.colors.textOnMedia}
      ios_backgroundColor={t.colors.surfaceSunken}
      {...webThumb}
    />
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.spacing.xl,
      marginBottom: t.spacing.md,
    },
    headerTitle: { ...t.type.title, color: t.colors.text },
    gear: {
      width: t.layout.touchTarget,
      height: t.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
    },
    section: { paddingHorizontal: t.spacing.xl, gap: t.spacing.md },
    avatarRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.lg },
    avatarEdit: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.colors.bg,
    },
    email: { ...t.type.body, color: t.colors.textMuted },
    roleTag: {
      alignSelf: "flex-start",
      backgroundColor: t.colors.accentSoft,
      paddingHorizontal: t.spacing.md,
      paddingVertical: 4,
      borderRadius: t.radius.pill,
    },
    roleText: { ...t.type.caption, color: t.colors.onAccentSoft, fontWeight: "700" },

    promoCard: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.lg,
      padding: t.spacing.lg,
      gap: t.spacing.sm,
    },
    promoTitle: { ...t.type.h3, color: t.colors.text },
    promoBody: { ...t.type.small, color: t.colors.textMuted, marginBottom: t.spacing.xs },

    draftBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.sm,
      backgroundColor: t.colors.warnSoft,
      borderRadius: t.radius.md,
      padding: t.spacing.md,
    },
    draftText: { ...t.type.small, color: t.colors.onWarnSoft, flex: 1, fontWeight: "600" },
    publishRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.md, minHeight: 44 },
    publishTitle: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700" },
    publishHint: { ...t.type.small, color: t.colors.textMuted },
    verifyCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.md,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    verifyTitle: { ...t.type.bodyStrong, color: t.colors.text, fontWeight: "700" },
    verifyHint: { ...t.type.small, color: t.colors.textMuted, marginTop: 1 },
    editTitle: { ...t.type.h2, color: t.colors.text, marginTop: t.spacing.sm },
    modelRow: { flexDirection: "row", gap: t.spacing.sm, flexWrap: "wrap" },
    twoCol: { flexDirection: "row", gap: t.spacing.md },

    portfolioHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: t.spacing.sm,
    },
    addPhoto: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: t.layout.touchTarget,
      paddingHorizontal: t.spacing.sm,
    },
    addPhotoText: { ...t.type.bodyStrong, color: t.colors.accentText, fontWeight: "700" },
    portfolioEmpty: {
      alignItems: "center",
      gap: t.spacing.sm,
      padding: t.spacing.xl,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: t.colors.borderStrong,
    },
    portfolioEmptyText: { ...t.type.small, color: t.colors.textMuted, textAlign: "center" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: t.spacing.sm },
    gridItem: {
      width: "31.5%",
      aspectRatio: 1,
      borderRadius: t.radius.md,
      overflow: "hidden",
      position: "relative",
    },
    gridDelete: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.colors.mediaChip,
      alignItems: "center",
      justifyContent: "center",
    },
  });
