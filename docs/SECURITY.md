# SnapCampus — Security Model

What is defended, how, and what is knowingly left open.

---

## 1. Configuration fails closed

`src/env.ts` validates the whole environment at boot, collects **every** problem
rather than stopping at the first, and throws before the server starts.

Rejected in production:

| Setting | Why it is fatal |
|---|---|
| Placeholder or <32-character JWT secrets | `.env.example` previously shipped `JWT_ACCESS_SECRET="dev-access-secret-change-me"`. Deploying that config booted cleanly and let anyone forge an access token for any user — including `role: "ADMIN"`. |
| `CORS_ORIGIN=*` | The old default was `*`, passed to `cors({origin: true, credentials: true})`. `origin: true` **reflects** the caller's origin, so with credentials enabled any website could make authenticated cross-origin reads of the API. |
| `EMAIL_DRIVER=console` | Prints every password-reset link into stdout. |
| `STORAGE_DRIVER=local` | Uploads are lost on every redeploy. |
| Incomplete S3 / Resend config | Fails at first use instead of at boot. |
| bcrypt cost < 10 | Too cheap to resist offline cracking. |

A custom ESLint rule bans `process.env.X || default`, so the pattern that caused
these cannot be reintroduced silently.

---

## 2. Authentication

**Passwords** — 10–72 bytes (bcrypt silently truncates past 72, so a 200-character
passphrase is only as strong as its first 72 bytes), checked against a
common-password denylist and for similarity to the user's own email address.

**Access tokens** — JWT with **algorithm, issuer and audience all pinned**.
Previously none were pinned, which exposed the algorithm-confusion class and
meant any other token signed with the same key was accepted as an access token.

**Login is constant-work.** `verifyPasswordDummy` runs a full bcrypt round when
the email does not exist. Before this, an unknown address returned in ~1ms while
a real one paid a full round — enough to enumerate the entire user table.

### Refresh token reuse detection

Tokens carry a `familyId` and a `revokedAt`. Replaying a revoked token revokes
the **whole family**.

Previously `rotateRefreshToken` simply deleted the old row, so a replayed stolen
token failed silently while the thief's rotated token stayed live indefinitely.
Rotation was also read-then-delete, so two concurrent refreshes could both
succeed; it is now compare-and-swap.

The mobile client now mirrors that invariant: all simultaneous 401 responses
share one refresh-token rotation, each request retries at most once, and token
persistence is serialized so an older asynchronous write cannot overwrite a
newer session. A transient network failure does not erase otherwise valid local
credentials; an explicit refresh rejection does. Socket.IO reconnects read the
current access token, use the same single-flight refresh path on authentication
expiry, and stop after bounded backoff instead of looping against a stale JWT.

These client paths pass TypeScript and production web export, but the mobile app
still has no automated behavior-test harness. Native sleep/wake, offline/online,
secure-storage, and concurrent-401 cases remain device acceptance gates.

### Rate limiting

`authLimiter` was previously keyed on `IP:email`, so credential stuffing simply
varied the email and never tripped it. `req.ip` was also used raw, letting an
IPv6 client rotate the low bits of its /64 to appear as billions of clients.

Now: IPv6 addresses are normalised to their /64, a separate per-IP limiter runs
alongside the per-account one, and `tokenLimiter` covers `/auth/refresh`,
`/logout`, `/verify-email`, `/change-password` and `/resend-verification` —
all of which previously had **no rate limiting at all**, making them free oracles
for brute-forcing opaque tokens and a usable email-bombing endpoint.

Reset and verification tokens are now consumed with a compare-and-swap. The
previous read-then-write let two simultaneous requests both redeem one link, and
other outstanding reset links stayed valid after one was used.

`trust proxy` is now configurable. Without it, behind a load balancer every user
shared a single rate-limit bucket.

---

## 3. Authorization

### The booking state machine

The most serious finding. There was **no state machine**: a photographer could
move a booking straight from `REQUESTED` to `COMPLETED` — no acceptance, no
shoot — and then repeat the call unbounded, each one running
`completedJobs: { increment: 1 }`.

That is direct reputation forgery on a marketplace where completed-job count is
the trust signal. Cancelled and declined bookings could also be resurrected, and
the increment was not atomic, so concurrent requests double-counted.

Now: transitions are validated, completion is atomic and one-way, `quotedPrice`
is photographer-only (clients could previously rewrite it on their own cancel
request), and the endpoint is rate-limited.

### Blocks were bypassable

Blocking someone stopped messages but **not bookings** — and creating a booking
upserts a thread and fires a push notification, giving a blocked harasser a
working channel back to the person who blocked them. Bookings now enforce
blocks, and reject unpublished (draft) profiles.

### Unvalidated identifiers

`POST /reports` accepted an arbitrary `threadId`, attaching someone else's
private conversation to a moderation ticket. `PUT /favorites/:id` and
`PUT /blocks/:id` passed unvalidated ids straight to Prisma, producing 500s from
foreign-key violations. `POST /notifications/read` took an unbounded `ids` array
into a SQL `IN (...)`. All are now validated and bounded.

### Realtime

The suspected "client can join arbitrary rooms" hole **did not exist** — the
server registers no client-callable events and Socket.IO room membership is
server-side only. It was hardened anyway: origin allowlist shared with HTTP,
account-existence check, disconnect at token expiry, 8KB buffer cap. Tests would
fail if a join handler were added later without a membership check.

---

## 4. Uploads

**SVG was accepted.** sharp rasterises SVG through librsvg, which follows
external references — so "upload an avatar" was a working SSRF and local-file
disclosure primitive. SVG is now rejected.

Format is determined from **magic bytes** against an allowlist, and the stored
extension comes from the detected type.

**No decoded-pixel cap existed.** A ~500KB flat PNG at 12000×12000 decodes to
hundreds of megabytes — a free out-of-memory kill. Now capped at 50MP with
`pages: 1` so animated inputs are not decoded frame by frame. Thumbnails derive
from the re-encoded output, so hostile input is decoded exactly once.

**`sharp` was upgraded 0.33.5 → 0.35.3**, closing four unpatched libvips CVEs
(CVE-2026-33327, -33328, -35590, -35591) that were being fed untrusted images.

`deleteByUrl` previously derived a filesystem path from
`url.split("/").pop()` with no validation.

---

## 5. Stored injection

`instagram` and `portfolioUrl` were free-text strings that the app passes to
`Linking.openURL(...)`. A photographer could store `javascript:`, `data:`,
`intent:` or an arbitrary custom scheme on their own public profile. Both are
now validated as http(s)-only.

---

## 6. Transport and errors

Strict CSP (`script-src 'none'`), `no-referrer`, 128KB body limits, sandboxed
`/uploads`. Multer and body-parser errors now map to 400/413 rather than opaque
500s — an oversized upload previously looked like a server fault rather than a
rejected request. Prisma P2002/P2003/P2025 map to 409/400/404.

---

## 7. What is NOT defended

- **Signup reveals whether an email is registered** (409 with an explicit message). Any product preventing duplicate accounts leaks this; hiding it means accepting a signup the user can never log in to. Mitigated by a per-IP limiter. Accepted residual risk.
- **No account lockout or CAPTCHA** beyond rate limiting.
- **No breach-corpus (HIBP) password check** — needs an external service.
- **Email verification is not enforced.** Unverified users can book and message. That is a product decision, not an oversight.
- **S3 and Resend code paths are untested** (`objectStorage.ts` ~67% statements) — exercising them requires real cloud credentials.
- **~45 `npm audit` findings remain in the Expo/Metro dev toolchain** (`tar` critical, `brace-expansion`, `postcss`, `@xmldom/xmldom`). Fixing them requires `expo@57`, a breaking major upgrade of the mobile app. **Production API dependencies are clean**; CI audits with `--omit=dev`.
- **Lint and CI cover the API only.** The Expo app has no lint/typecheck/test job.
- **Prisma is on 5.22** (7.9 available) — deliberately not upgraded, since a major ORM bump during a security pass would obscure what actually changed.

---

## 8. Verification

231 tests across 12 suites, ~94% statements, against real PostgreSQL with no
Prisma mocking. Stability confirmed over repeated consecutive runs and after a
clean `npm ci`.

> The suite was initially flaky (~1 run in 3, random suites failing with
> impossible statuses like 407 and 501). Root cause: supertest binds and closes
> an ephemeral server **per request**, and the OS recycled ports fast enough to
> return a socket for a dead server. Fixed by binding one server per suite and
> disabling Node's global keep-alive agent in tests.
>
> Worth recording because it looked exactly like a product bug. The same failure
> was independently hit and diagnosed in the GhanaConstruct codebase.
