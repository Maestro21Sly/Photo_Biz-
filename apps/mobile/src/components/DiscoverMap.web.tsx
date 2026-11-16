import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { mapCss, pinCss, TILE_URL } from "./mapHtml";

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  price: string;
}

const FALLBACK = { latitude: 36.0014, longitude: -78.9382 };
const STYLE_TAG_ID = "snapcampus-leaflet-discover-theme";

/** Web multi-marker map using Leaflet in the DOM. */
export function DiscoverMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect: (id: string) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Marker colours live in a single injected <style> tag rather than inline on
  // each divIcon, so a scheme flip restyles every pin without rebuilding them.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement("style");
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    tag.textContent =
      mapCss({ isDark: t.isDark, surface: t.colors.surfaceMuted }) +
      pinCss({
        accent: t.colors.accent,
        onAccent: t.colors.onAccent,
        ring: t.colors.surface,
        shadow: t.colors.mediaTextShadow,
      });
  }, [
    t.isDark,
    t.colors.surfaceMuted,
    t.colors.accent,
    t.colors.onAccent,
    t.colors.surface,
    t.colors.mediaTextShadow,
  ]);

  const renderMarkers = useCallback(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const markers: any[] = [];
    pointsRef.current.forEach((p) => {
      const icon = L.divIcon({ className: "", html: `<div class="pin">${p.price}</div>` });
      const m = L.marker([p.latitude, p.longitude], { icon, title: p.name }).addTo(layerRef.current);
      m.on("click", () => onSelectRef.current(p.id));
      markers.push(m);
    });
    if (markers.length) {
      try {
        mapRef.current.fitBounds(L.featureGroup(markers).getBounds().pad(0.25));
      } catch {
        /* single point */
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ensure = async () => {
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
        s.onerror = () => reject(new Error("leaflet"));
        document.head.appendChild(s);
      });
      return w.L;
    };

    ensure()
      .then((L) => {
        if (cancelled || mapRef.current) return;
        const el = containerRef.current as unknown as HTMLElement | null;
        if (!el) return;
        const center = pointsRef.current[0] ?? FALLBACK;
        const map = L.map(el, { attributionControl: false }).setView(
          [center.latitude, center.longitude],
          13
        );
        L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        renderMarkers();
        setTimeout(() => {
          map.invalidateSize();
          renderMarkers();
        }, 200);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [renderMarkers]);

  // Rebuild markers whenever points change.
  useEffect(() => {
    renderMarkers();
  }, [points, renderMarkers]);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Map with ${points.length} photographer${points.length === 1 ? "" : "s"}. Switch to list view to browse them with a screen reader.`}
    >
      <View ref={containerRef} style={StyleSheet.absoluteFill as any} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      borderRadius: t.radius.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceMuted,
    },
  });
