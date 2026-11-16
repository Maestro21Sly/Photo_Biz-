# Duke Creative Marketplace Master Plan

Status: active — **real V1 build exists** (see [../README.md](../README.md) → Implementation)

> **Merged note.** A working V1 already exists as **SnapCampus** in
> [`../../`](../../) — a campus photography
> marketplace covering profiles, portfolios, discovery, booking, chat, and
> reviews. The MVP below is **mostly built**; the real work is generalizing
> photography → broader creative categories and deciding Duke-vs-generic scope.

## Current stance

This should be treated as a focused campus-marketplace build, not as the Ghana creative marketplace copied into a new geography.

## Core thesis

Students and campus communities need an easier way to find and book trusted creatives for shoots, events, design, and editing work.

## Primary user groups

- Student clients
- Student creatives
- Campus organizations
- Small event organizers

## MVP shape (actual status in SnapCampus V1)

- Creative profiles — ✅ built
- Portfolio links — ✅ built (portfolio photo uploads)
- Service categories — 🔧 photography-only; needs generalizing to more categories
- Request forms — ✅ built (booking requests)
- Quote or booking workflow — ✅ built (accept/decline/complete/cancel flow)
- Reviews and reliability signals — ✅ built (reviews, ratings, verification badges)

## Architecture starting point

Key entities:

- creative profile
- portfolio item
- service package
- request
- booking
- review

## Product-design direction

- Youthful but not messy
- Mobile-friendly
- Fast portfolio browsing
- Booking clarity over social-feed behavior

## Development path (reconciled — done vs. remaining)

Done in V1 (do not rebuild):

1. ~~Pick first category, likely photography first~~ ✅ (SnapCampus = photography)
4. ~~Add structured booking~~ ✅ (full request→booking→status flow shipped)

Remaining (the real next work):

2. Onboard a small number of verified creators (real go-to-market, not code)
3. Run request-to-match with real demand on the live V1
5. Generalize service categories beyond photography (editing, design, events)
6. Decide Duke-first branding vs. keep generic "SnapCampus"
7. Turn on payments (Stripe Connect) + calendar/availability when demand repeats

## Founder-input items for later

- Duke-only versus broader university rollout
- Photography-only versus photography plus editing/design
- Whether payments are in scope early
