# SnapCampus — Interface Design

A campus photography marketplace. Students booking graduation portraits, events
and headshots; student photographers running a small business from a phone.

Both sides are young and design-literate, and they compare this against
Instagram and Airbnb without consciously deciding to. That sets the bar: a
dated or clumsy interface loses them before they read a word.

One codebase ships to **iOS, Android and web**.

---

## 1. The theme layer

`src/theme/` — `colors.ts`, `tokens.ts`, `ThemeProvider.tsx`, `index.ts`.

Semantic colour tokens, a type scale, spacing, radii and shadows. Every screen
consumes them: **there are zero hardcoded hex values** in `app/` or `src/`.
Dark mode follows the OS setting.

18 of 19 screens import the theme. The exception is `app/(auth)/_layout.tsx`, a
router layout with no visual styling — correctly excluded.

## 2. Contrast is enforced, not asserted

```bash
node scripts/check-contrast.mjs        # exits non-zero on failure
node scripts/check-contrast.mjs --table
```

**104 pairs across light and dark**, plus 6 web-shell colours kept in sync with
`public/index.html`.

The method is stated in the script: **every foreground against every background
it actually lands on.** That phrasing exists because the first version of this
checker measured `textFaint` against only `bg` and `surface` — both passed
comfortably — while the same token was failing on three other surfaces it
genuinely renders on:

| Pair | Was | Needed | What renders it |
|---|---|---|---|
| light `textFaint` on `mediaPlaceholder` | **3.94:1** | 4.5 | SmartImage fallback tile |
| light `textFaint` on `surfaceMuted` | **4.31:1** | 4.5 | chat composer placeholder |
| light `textFaint` on `accentSoft` | **4.27:1** | 4.5 | unread notification timestamp |
| dark `textFaint` on `accentSoft` | **4.48:1** | 4.5 | same |
| dark `outline` on `surfaceElevated` | **2.93:1** | 3.0 | bottom-sheet grab handle |

Fixed numerically, not by eye: light `textFaint` `#776F66`→`#6A635B`, dark
`accentSoft` `#3A2019`→`#331B15`, dark `outline` `#6E665D`→`#766E66`.

The checker also reports the **tightest margin**, so headroom loss is visible
before it becomes a failure:

```
Tightest margin: light onAccent on accent at 4.71:1 (needs 4.5:1, +0.21 headroom)
```

> The identical class of miss occurred on the sibling GhanaConstruct web app —
> a token measured against cards but never against the page background, failing
> at 2.86:1. Partial coverage in a contrast checker is worse than none, because
> it produces a confident green tick over an untested surface.

## 3. Images are the content

This is a photography product, so image presentation *is* the design.
`SmartImage` handles aspect ratios and placeholder states so galleries never
reflow; `Lightbox` handles full-screen viewing. A marketplace whose photographs
pop in and jump the layout reads as broken regardless of anything else.

---

## 4. Three bugs that only rendering could find

Verified by serving the real `expo export` output and driving it with Playwright
against the real API — Postgres and Redis were already running and seeded, so no
mock API was built and `apps/api` was never written to.

**1. Chat rendered every message upside-down and mirrored — on all three
platforms.** `Bubble` applied `transform: [{ scaleY: -1 }]` to counter the
inverted list, but React Native's `VirtualizedListCellRenderer` *already*
composes that inversion onto every cell. The manual flip was a third transform,
netting `scaleY(-1)`. This was not web-only: iOS and Android were equally
broken. Both manual transforms removed; the list stays `inverted`, which is the
correct mechanism.

**2. Tab bar labels sliced in half wherever `insets.bottom == 0`** — the web
build and Android hardware-key devices. The bar was 56pt; its contents need 62.
Because the label sits in a flex-shrinkable box with `overflow: hidden`, the
deficit did not grow the bar, it clipped the descenders. A notched iPhone's 34pt
home indicator was silently absorbing the error. Rebuilt from an itemised budget
to 64pt with a pinned icon size and an explicit label `lineHeight`, so the
arithmetic is not platform-dependent.

**3. The Published switch thumb was Material teal on web.** React Native Web
reads `thumbColor` for the *off* state only and falls back to
`activeThumbColor` when on.

None of these are visible by reading the code.

## 5. Other real fixes

- **The photographer profile form was wiped by React Query's refetch-on-focus.** Type half a bio, switch tabs, come back — everything reverted. Now hydrates once, with an explicit re-hydrate after save.
- **Unselected filter chips were vanishing.** `surface` and `surfaceElevated` are both pure white in light mode, so a chip's idle fill sat behind a 1.3:1 hairline. Moved to `surfaceMuted`.
- **Android sheets left an undimmed status-bar strip** — `statusBarTranslucent` added to both.
- Discover's map view showed "Nothing to map yet" while still loading or after an error; it now has proper loading, error and empty branches.

## 6. Data states

Pull-to-refresh added to `photographer/[id]` and `booking-detail/[id]` — the two
fetching screens that had none. The five existing call sites were collapsed onto
a `useRefreshProps` helper, returned as **props rather than an element**, because
Android `cloneElement`s `refreshControl`.

## 7. Dynamic Type

`booking-detail`'s fixed 74pt label column stacks past 130% scale. Sign-up's
terms checkbox top-aligns, so it does not drift to the middle of a wrapped
paragraph.

## 8. Scroll performance

Three screens recreated their `ItemSeparatorComponent` *type* every render,
which remounts every separator on every pass. The portfolio gallery and Lightbox
rebuilt every page mid-swipe. All memoised, with window tuning on both image
pagers.

---

## 9. What is NOT verified

- **No iOS or Android simulator was run.** All visual verification was on the web build in Chrome at 402×874. The chat-inversion fix is grounded in React Native source (`VirtualizedListCellRenderer`) which is shared native/web code, but it was not observed on a device.
- **Haptics, native modals, keyboard avoidance and safe-area insets are unverified.** On web `insets.bottom == 0`, haptics are a no-op, and there is no software keyboard — so `KeyboardAvoidingView`, `statusBarTranslucent`, home-indicator clearance and the chat composer's inset logic were reasoned about, not observed. **The tab-bar fix raises the height by 8pt on notched devices**; correct by the budget, unconfirmed on hardware.
- **Dynamic Type was not observed at 200%.** React Native Web reports `fontScale: 1`, so the `fontScale > 1.3` branches never executed. Fixed by inspection.
- **Reduce-motion paths were not exercised.**
- **Maps were not rendered.** Leaflet loads from unpkg; neither the CDN path nor the dark tile filter was verified.
- **Progressive image loading is untested with real thumbnails.** The seed uses `picsum.photos` URLs with `thumbnailUrl: null`, so the placeholder path only ran in its fallback form. Only genuine uploads produce thumbnails.
- **No test suite exists for the mobile app.** The contrast gate and `tsc` are the only automated checks. `apps/api` has 231 tests; the client has none.
