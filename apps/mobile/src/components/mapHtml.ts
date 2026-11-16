/**
 * Shared Leaflet snippets for the four map surfaces (picker / discover, each
 * with a native WebView and a web DOM implementation).
 *
 * Why OpenStreetMap tiles plus a CSS filter rather than a dark tile provider:
 * a second provider means a second attribution obligation and another CDN that
 * can be blocked on campus wifi. Inverting the tile pane — and only the tile
 * pane, so markers keep their real colours — is the standard way to get a dark
 * basemap out of light tiles, and it costs nothing.
 */

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export function mapCss(opts: { isDark: boolean; surface: string }): string {
  return `
html,body,#map{height:100%;margin:0;padding:0;background:${opts.surface}}
${
  opts.isDark
    ? `.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.75)}`
    : ""
}
.leaflet-container{background:${opts.surface}}
`;
}

export function pinCss(opts: {
  accent: string;
  onAccent: string;
  ring: string;
  shadow: string;
}): string {
  return `.pin{
  background:${opts.accent};
  color:${opts.onAccent};
  border:2px solid ${opts.ring};
  border-radius:14px;
  padding:4px 9px;
  font:700 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  box-shadow:0 2px 8px ${opts.shadow};
  white-space:nowrap;
}`;
}
