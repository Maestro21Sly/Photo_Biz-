import { API_BASE } from "./config";
import { deleteItem, getItem, setItem } from "./storage";

const ACCESS_KEY = "sc_access";
const REFRESH_KEY = "sc_refresh";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/**
 * Exactly one refresh-token rotation may be in flight at a time. Refresh tokens
 * are single-use on the API, so allowing two expired requests to rotate the
 * same token concurrently would make the second request look like token theft
 * and revoke the whole session family.
 */
export type RefreshOutcome = "refreshed" | "rejected" | "unavailable" | "superseded";
let refreshPromise: Promise<RefreshOutcome> | null = null;
let credentialsVersion = 0;
let tokenStorageQueue: Promise<void> = Promise.resolve();

/** Keep persisted token mutations in invocation order, even if storage is slow. */
function enqueueTokenStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = tokenStorageQueue.then(operation, operation);
  tokenStorageQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function loadTokens(): Promise<boolean> {
  const loadVersion = ++credentialsVersion;
  const [storedAccessToken, storedRefreshToken] = await enqueueTokenStorage(() =>
    Promise.all([getItem(ACCESS_KEY), getItem(REFRESH_KEY)])
  );
  // A sign-in/sign-out that started while storage was being read owns the newer
  // in-memory state; do not replace it with this stale bootstrap snapshot.
  if (credentialsVersion !== loadVersion) return Boolean(accessToken && refreshToken);
  accessToken = storedAccessToken;
  refreshToken = storedRefreshToken;
  return Boolean(accessToken && refreshToken);
}

export async function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  credentialsVersion += 1;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  await enqueueTokenStorage(() =>
    Promise.all([setItem(ACCESS_KEY, tokens.accessToken), setItem(REFRESH_KEY, tokens.refreshToken)]).then(
      () => undefined
    )
  );
}

export async function clearTokens() {
  credentialsVersion += 1;
  accessToken = null;
  refreshToken = null;
  await enqueueTokenStorage(() =>
    Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY)]).then(() => undefined)
  );
}

export function getAccessToken() {
  return accessToken;
}

/** Clear local credentials and let AuthProvider return the app to sign-in. */
export async function expireSession(): Promise<void> {
  await clearTokens();
  onUnauthorized?.();
}

/** Revoke the current refresh token server-side, then clear local tokens. */
export async function logout(): Promise<void> {
  const token = refreshToken;
  if (token) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
    } catch {
      /* best-effort */
    }
  }
  await clearTokens();
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function performRefresh(): Promise<RefreshOutcome> {
  const token = refreshToken;
  const versionAtStart = credentialsVersion;
  if (!token) return "rejected";
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (!res.ok) {
      // A 401 means the token is invalid/expired/reused. Rate limits and server
      // faults are temporary and must not sign a user out.
      return res.status === 401 ? "rejected" : "unavailable";
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    // Logout or a new sign-in may have replaced the credentials while this
    // network request was in flight. Never let an old response resurrect or
    // overwrite that newer session.
    if (credentialsVersion !== versionAtStart || refreshToken !== token) return "superseded";
    await saveTokens(data);
    return "refreshed";
  } catch {
    return "unavailable";
  }
}

/**
 * Rotate the current refresh token once and share the result with every waiter.
 * Requests that receive 401 together queue on this promise, then all retry with
 * the newly issued access token.
 */
export function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** FormData for multipart uploads — sent as-is without JSON headers. */
  form?: FormData;
  auth?: boolean;
  _retried?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, auth = true } = opts;
  const requestAccessToken = auth ? accessToken : null;

  const headers: Record<string, string> = {};
  if (requestAccessToken) headers.Authorization = `Bearer ${requestAccessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && auth && !opts._retried) {
    // Another queued request may already have refreshed while this request was
    // on the wire. In that case retry with the new access token without rotating
    // the new refresh token again.
    if (requestAccessToken && accessToken && requestAccessToken !== accessToken) {
      return api<T>(path, { ...opts, _retried: true });
    }

    const outcome = await refreshAccessToken();
    if (outcome === "refreshed") return api<T>(path, { ...opts, _retried: true });
    if (outcome === "superseded" && accessToken && accessToken !== requestAccessToken) {
      return api<T>(path, { ...opts, _retried: true });
    }
    if (outcome === "unavailable") {
      throw new ApiError(503, "Couldn't refresh your session — check your connection and try again");
    }

    if (outcome === "superseded") throw new ApiError(401, "Session changed — please try again");

    await expireSession();
    throw new ApiError(401, "Session expired");
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Request failed", data);
  }
  return data as T;
}
