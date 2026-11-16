import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
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

/** Native multi-marker map (Leaflet in a WebView). Tapping a marker selects it. */
export function DiscoverMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect: (id: string) => void;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);

  const html = useMemo(() => {
    const center = points[0] ?? FALLBACK;
    const data = JSON.stringify(points);
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
${mapCss({ isDark: t.isDark, surface: t.colors.surfaceMuted })}
${pinCss({
  accent: t.colors.accent,
  onAccent: t.colors.onAccent,
  ring: t.colors.surface,
  shadow: t.colors.mediaTextShadow,
})}
</style>
</head><body><div id="map"></div>
<script>
  var pts = ${data};
  var map = L.map('map',{attributionControl:false}).setView([${center.latitude},${center.longitude}],13);
  L.tileLayer('${TILE_URL}',{maxZoom:19}).addTo(map);
  var group = [];
  pts.forEach(function(p){
    var icon = L.divIcon({className:'',html:'<div class="pin">'+p.price+'</div>',iconSize:null});
    var m = L.marker([p.latitude,p.longitude],{icon:icon,title:p.name}).addTo(map);
    m.on('click', function(){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(p.id); });
    group.push(m);
  });
  if (group.length) { try { map.fitBounds(L.featureGroup(group).getBounds().pad(0.25)); } catch(e){} }
</script></body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points), t.isDark, t.colors.accent, t.colors.onAccent, t.colors.surface, t.colors.surfaceMuted]);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Map with ${points.length} photographer${points.length === 1 ? "" : "s"}. Switch to list view to browse them with a screen reader.`}
    >
      <WebView
        // Force a reload when the marker set or the colour scheme changes.
        key={`${points.length}-${t.scheme}`}
        originWhitelist={["*"]}
        source={{ html }}
        style={{ backgroundColor: t.colors.surfaceMuted }}
        onMessage={(e) => onSelect(e.nativeEvent.data)}
      />
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
