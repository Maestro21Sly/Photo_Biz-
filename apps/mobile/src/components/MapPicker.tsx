import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { mapCss, TILE_URL } from "./mapHtml";

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Campus-ish default center (Duke University) when nothing is picked yet.
const DEFAULT: LatLng = { latitude: 36.0014, longitude: -78.9382 };

/**
 * Native map picker. Renders the same Leaflet + OpenStreetMap experience inside
 * a WebView (no API key on iOS or Android). Tap/drag the pin; coordinates are
 * posted back to React Native via postMessage.
 *
 * The whole thing is also mirrored into a plain text line below the map, which
 * is the only part a screen-reader user can act on — a draggable pin inside a
 * WebView is not reachable by VoiceOver or TalkBack.
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
  /** Display-only (booking detail) — no pin dragging. */
  readOnly?: boolean;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const start = value ?? DEFAULT;

  const html = useMemo(
    () => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>${mapCss({ isDark: t.isDark, surface: t.colors.surfaceMuted })}</style>
</head><body><div id="map"></div>
<script>
  var map = L.map('map',{attributionControl:false}).setView([${start.latitude},${start.longitude}],14);
  L.tileLayer('${TILE_URL}',{maxZoom:19}).addTo(map);
  var marker = L.marker([${start.latitude},${start.longitude}],{draggable:${!readOnly}}).addTo(map);
  function send(ll){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({latitude:ll.lat,longitude:ll.lng})); }
  ${
    readOnly
      ? ""
      : `marker.on('dragend', function(){ send(marker.getLatLng()); });
  map.on('click', function(e){ marker.setLatLng(e.latlng); send(e.latlng); });`
  }
</script></body></html>`,
    // Rebuilt when the colour scheme flips (the tile filter lives in the CSS)
    // but not on every coordinate change, which would reload the map mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.isDark, readOnly]
  );

  return (
    <View style={{ gap: t.spacing.sm }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.mapWrap, { height }]}>
        <WebView
          // Remounting on scheme change is what applies the new tile filter.
          key={t.scheme}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ backgroundColor: t.colors.surfaceMuted }}
          onMessage={(e) => {
            try {
              const c = JSON.parse(e.nativeEvent.data) as LatLng;
              onChange(c);
            } catch {
              /* ignore malformed message */
            }
          }}
        />
      </View>
      <View style={styles.coordsRow}>
        <Ionicons name="location-outline" size={14} color={t.colors.textMuted} />
        <Text style={styles.coords}>
          {value
            ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : readOnly
              ? "No pin set"
              : "Tap the map to drop a pin"}
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
