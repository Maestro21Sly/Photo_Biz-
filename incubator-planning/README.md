# Duke Creative Marketplace

## Status

`Gated — real V1 implementation exists locally` (photography-first slice built,
not evidenced as deployed or commercially validated)

## What this workspace is

This workspace is the planning layer for a Duke-focused creative services
marketplace. **A substantial local V1 implementation exists** as **SnapCampus** — a campus
*photography* marketplace, which is exactly the "photography first" wedge this
plan calls for. This folder now tracks how to grow that V1 from photography into
the broader creative marketplace, not how to start from scratch.

## Implementation (the real code)

- **Code:** [`../`](../) (product name: **SnapCampus**)
- **Overview:** [`README.md`](../README.md)
- **Stack:** Expo (React Native, iOS/Android/web) · Node + Express + Socket.IO · PostgreSQL + Prisma · JWT auth
- Original static PWA prototype preserved under `../legacy-pwa/`

### Already built in V1 ✅

- Student + creative (photographer) accounts with secure auth
- Creator onboarding: editable profile, pricing, specialties, **portfolio uploads**
- Discovery feed: search, specialty filters, sort, infinite scroll
- Rich profiles (gallery, stats, pricing, reviews)
- Favorites / saves
- **Booking requests** + status flow (accept / decline / complete / cancel)
- **In-app realtime chat** (Socket.IO)
- **Reviews & ratings** + verification badges
- Push notifications; payment-ready schema (charging deferred)

### Gaps vs. this plan (real remaining work) 🔧

- **Naming/scope:** V1 is "SnapCampus" (generic campus), not Duke-branded —
  decide Duke-first identity vs. keep generic (a founder-input item below)
- **Category breadth:** V1 is photography-only; this plan wants photography +
  editing/design/events — generalize service categories
- Payments (Stripe Connect), calendar/availability, earnings dashboard (post-V1 roadmap)

## Start here

- [planning/master-plan.md](planning/master-plan.md) (reconciled with the real build)
- [architecture/initial-architecture.md](architecture/initial-architecture.md)
- [development/execution-roadmap.md](development/execution-roadmap.md)
