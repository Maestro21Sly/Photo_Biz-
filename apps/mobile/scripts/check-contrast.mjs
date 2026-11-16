/**
 * WCAG contrast guard for the colour tokens.
 *
 * Run: node scripts/check-contrast.mjs
 *
 * Exists because "sufficient contrast in both themes" is the kind of claim
 * that quietly rots. Every pair the UI actually renders is listed below with
 * the level it has to clear, and the script exits non-zero if one regresses.
 *
 *   AA  body text        4.5:1
 *   AA  large text       3.0:1  (>=18.66px, or >=14px bold)
 *   AA  non-text/UI      3.0:1  (icons, borders that carry meaning)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/theme/colors.ts"), "utf8");

/** Pull the two exported objects out of the TS source without a compiler. */
function parseScheme(name) {
  const start = src.indexOf(`export const ${name}: Colors = {`);
  if (start === -1) throw new Error(`${name} not found`);
  const body = src.slice(src.indexOf("{", start) + 1, src.indexOf("\n};", start));
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*"([^"]+)"/gm)) out[m[1]] = m[2];
  return out;
}

function toRgb(c) {
  if (c.startsWith("rgba")) {
    const [r, g, b] = c.match(/[\d.]+/g).map(Number);
    return [r, g, b];
  }
  const h = c.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(c) {
  const [r, g, b] = toRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * [foreground, background, minimum, what renders it]
 *
 * METHOD — read this before adding a colour.
 *
 * The list is built by walking every `makeStyles` block in the app and writing
 * down each foreground together with **every** background it can land on, not
 * just the most flattering one. That distinction is not academic: an earlier
 * version of this file checked `textFaint` against `bg` and `surface` only, and
 * both passed comfortably — while the same token was failing at 3.94:1 on
 * `mediaPlaceholder` (SmartImage's fallback tile), 4.31:1 on `surfaceMuted`
 * (the chat composer placeholder) and 4.27:1 on `accentSoft` (an unread
 * notification timestamp). A token is only as accessible as its worst pairing.
 *
 * So: when you use a colour on a new surface, add the pair here even if you are
 * sure it is fine. Being sure is how the last three got through.
 */
const PAIRS = [
  /* ---- text on every surface it renders on ---- */
  ["text", "bg", 4.5, "body copy on the canvas"],
  ["text", "surface", 4.5, "body copy on cards"],
  ["text", "surfaceMuted", 4.5, "chip + input labels, chat composer text"],
  ["text", "surfaceElevated", 4.5, "sheet titles, toast text"],
  ["text", "accentSoft", 4.5, "unread notification title"],
  ["bg", "text", 4.5, "Discover active specialty chip (inverted fill)"],

  ["textMuted", "bg", 4.5, "secondary copy"],
  ["textMuted", "surface", 4.5, "secondary copy on cards"],
  ["textMuted", "surfaceMuted", 4.5, "tag labels, chat day divider, settings info"],
  ["textMuted", "surfaceElevated", 4.5, "sheet message + Cancel label"],
  ["textMuted", "accentSoft", 4.5, "unread notification body, active RoleCard description"],
  ["textMuted", "mediaPlaceholder", 4.5, "SmartImage fallback label (a photographer's name)"],

  ["textFaint", "bg", 4.5, "timestamps, placeholders, demo hint"],
  ["textFaint", "surface", 4.5, "placeholder text in inputs, DatePicker month"],
  ["textFaint", "surfaceMuted", 4.5, "placeholder in the chat composer + quote input"],
  ["textFaint", "surfaceElevated", 4.5, "muted copy inside sheets"],
  ["textFaint", "accentSoft", 4.5, "unread notification timestamp"],
  ["textFaint", "mediaPlaceholder", 4.5, "SmartImage fallback icon"],
  ["textFaint", "tabBar", 4.5, "inactive tab label (11px — held to the small-text bar)"],

  /* ---- brand + status text ---- */
  ["accentText", "bg", 4.5, "links (Forgot password, Sign in, Add photo)"],
  ["accentText", "surface", 4.5, "links on cards"],
  ["onAccent", "accent", 4.5, "primary button, chat bubble, active chip, map pin"],
  ["onAccent", "accentPressed", 4.5, "pressed primary button label"],
  ["onAccent", "danger", 4.5, "Button variant=danger reuses onAccent, not onDanger"],
  ["onAccentSoft", "accentSoft", 4.5, "role tag / New badge / Negotiable / avatar initials"],
  ["onSuccessSoft", "successSoft", 4.5, "Confirmed booking pill, verify-email tick"],
  ["onWarnSoft", "warnSoft", 4.5, "Pending pill, draft banner"],
  ["onDangerSoft", "dangerSoft", 4.5, "Declined pill, verify-email failure"],
  ["onVerifiedSoft", "verifiedSoft", 4.5, "Verified badge"],
  ["onDanger", "danger", 4.5, "reserved destructive-on-fill token"],
  ["danger", "bg", 4.5, "inline form errors"],
  ["danger", "surface", 4.5, "inline errors on cards"],
  ["danger", "surfaceMuted", 4.5, "ActionSheet destructive action label"],
  ["success", "bg", 4.5, "'You reviewed this shoot'"],
  ["success", "surface", 4.5, "quoted price, Reviewed row"],

  /* ---- over photography ---- */
  ["textOnMedia", "mediaChip", 4.5, "price tag / lightbox counter over a photo"],
  ["onMediaChip", "mediaChip", 4.5, "favourite, close, back icons over a photo"],

  /* ---- non-text / large-text roles (3:1) ---- */
  ["accent", "bg", 3, "icons + active indicators"],
  ["accent", "surface", 3, "icons on cards"],
  ["accent", "surfaceElevated", 3, "toast info icon"],
  ["accent", "accentSoft", 3, "EmptyState icon, active RoleCard tick"],
  ["accent", "tabBar", 3, "active tab icon"],
  ["accent", "mediaChip", 3, "saved (filled) heart over a photo"],
  ["success", "surfaceElevated", 3, "toast success icon"],
  ["danger", "surfaceElevated", 3, "toast error icon"],
  ["star", "surface", 3, "rating stars"],
  ["star", "bg", 3, "rating stars on canvas"],
  ["outline", "bg", 3, "checkbox + empty rating star"],
  ["outline", "surface", 3, "meaningful outlines on cards"],
  ["outline", "surfaceElevated", 3, "bottom-sheet grab handle"],
  ["focus", "bg", 3, "focus ring"],
  ["focus", "surface", 3, "focus ring on cards"],
];

// `--table` prints every measurement rather than only the regressions, which is
// what you want when reviewing a palette change or quoting numbers in a report.
const showAll = process.argv.includes("--table");

let failed = 0;
let tightest = { r: Infinity };
for (const [schemeName, scheme] of [
  ["light", parseScheme("lightColors")],
  ["dark", parseScheme("darkColors")],
]) {
  if (showAll) console.log(`\n--- ${schemeName} ---`);
  for (const [fg, bg, min, what] of PAIRS) {
    const missing = [fg, bg].find((k) => scheme[k] === undefined);
    if (missing) {
      failed++;
      console.error(`FAIL  ${schemeName} references unknown token "${missing}"`);
      continue;
    }
    const r = ratio(scheme[fg], scheme[bg]);
    const pass = r + 1e-9 >= min;
    // Track the thinnest margin so a palette edit that eats all the headroom is
    // visible before it actually breaks.
    const margin = r - min;
    if (margin < tightest.r) tightest = { r: margin, label: `${schemeName} ${fg} on ${bg}`, ratio: r, min };
    if (showAll) {
      console.log(
        `${pass ? "ok  " : "FAIL"} ${`${fg} on ${bg}`.padEnd(38)} ${r.toFixed(2).padStart(6)}:1  (need ${min})  ${what}`
      );
    }
    if (!pass) {
      failed++;
      console.error(
        `FAIL  ${schemeName.padEnd(5)} ${fg} on ${bg} = ${r.toFixed(2)}:1 (need ${min}:1) — ${what}`
      );
    }
  }
}

/**
 * The web SPA shell (`public/index.html`) has to hard-code a handful of colours
 * because it paints before any JavaScript runs. This asserts those copies still
 * match the tokens, so the two can't drift apart unnoticed.
 */
const shell = readFileSync(join(here, "../public/index.html"), "utf8").toLowerCase();
const light = parseScheme("lightColors");
const dark = parseScheme("darkColors");
const MIRRORED = [
  ["light bg", light.bg],
  ["dark bg", dark.bg],
  ["light accentSoft (selection)", light.accentSoft],
  ["dark accentSoft (selection)", dark.accentSoft],
  ["light focus ring", light.focus],
  ["dark focus ring", dark.focus],
];
for (const [what, hex] of MIRRORED) {
  if (!shell.includes(hex.toLowerCase())) {
    failed++;
    console.error(`FAIL  public/index.html is missing ${hex} — ${what}`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log(
  `\nContrast OK — ${PAIRS.length * 2} pairs checked across light and dark; ` +
    `${MIRRORED.length} web-shell colours in sync.`
);
console.log(
  `Tightest margin: ${tightest.label} at ${tightest.ratio.toFixed(2)}:1 ` +
    `(needs ${tightest.min}:1, +${tightest.r.toFixed(2)} headroom).`
);
