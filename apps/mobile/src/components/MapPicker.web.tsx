import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { mapCss, TILE_URL } from "./mapHtml";

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Campus-ish default center (Duke University) when nothing is picked yet.
const DEFAULT: LatLng = { latitude: 36.0014, longitude: -78.9382 };

const STYLE_TAG_ID = "snapcampus-leaflet-theme";

/** Injects (and re-injects) the shared tile CSS so dark mode reaches Leaflet. */
function applyMapTheme(isDark: boolean, surface: string) {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = mapCss({ isDark, surface });
}

/**
 * Web map picker using Leaflet + OpenStreetMap (no API key). Tap or drag the
 * pin to choose a location. RN-web renders <View> as a <div>, which we hand to
 * Leaflet as its container.
 */
export function MapPicker({
  value,
  onChange,
  height = 220,
  label,
  readOnly = false,
}: {
  value: LatLng | null;
  onChange: (c: LatLng) => void;
  height?: number;
  label?: string;
  readOnly?: boolean;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    applyMapTheme(t.isDark, t.colors.surfaceMuted);
  }, [t.isDark, t.colors.surfaceMuted]);

  useEffect(() => {
    let cancelled = false;

    const ensureLeaflet = async () => {
      const w = window as any;
      if (w.L) return w.L;
      if (!document.querySelector("link[data-leaflet]")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.setAttribute("data-leaflet", "1");
        document.head.appendChild(link);
      }
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("leaflet failed"));
        document.head.appendChild(s);
      });
      return w.L;
    };

    ensureLeaflet()
      .then((L) => {
        if (cancelled || mapRef.current) return;
        const el = containerRef.current as unknown as HTMLElement | null;
        if (!el) return;
        const start = value ?? DEFAULT;
        const center: [number, number] = [start.latitude, start.longitude];
        const map = L.map(el, { attributionControl: false }).setView(center, 14);
        L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
        const marker = L.marker(center, { draggable: !readOnly }).addTo(map);
        mapRef.current = map;
        markerRef.current = marker;
        if (!readOnly) {
          const emit = (latlng: { lat: number; lng: number }) =>
            onChangeRef.current({ latitude: latlng.lat, longitude: latlng.lng });
          marker.on("dragend", () => emit(marker.getLatLng()));
          map.on("click", (e: any) => {
            marker.setLatLng(e.latlng);
            emit(e.latlng);
          });
        }
        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => {
        /* offline / CDN blocked — picker still usable once online */
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync if value changes externally.
  useEffect(() => {
    if (value && markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([value.latitude, value.longitude]);
    }
  }, [value]);

  return (
    <View style={{ gap: t.spacing.sm }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.mapWrap, { height }]}>
        <View ref={containerRef} style={StyleSheet.absoluteFill as any} />
      </View>
      <View style={styles.coordsRow}>
        <Ionicons name="location-outline" size={14} color={t.colors.textMuted} />
        <Text style={styles.coords}>
          {value
            ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : readOnly
              ? "No pin set"
              : "Click the map to drop a pin"}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    label: { ...t.type.small, color: t.colors.textMuted, fontWeight: "600", marginLeft: 2 },
    mapWrap: {
      borderRadius: t.radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceMuted,
    },
    coordsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    coords: { ...t.type.small, color: t.colors.textMuted, flex: 1 },
  });
