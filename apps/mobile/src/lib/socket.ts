import { io, type Socket } from "socket.io-client";
import { API_URL } from "./config";
import { expireSession, getAccessToken, refreshAccessToken } from "./api";

let socket: Socket | null = null;
let intentionalDisconnect = false;
let tokenUsedForConnection: string | null = null;
let pendingConnectionToken: string | null = null;
let authRecovery: Promise<void> | null = null;
let authRecoveryTarget: Socket | null = null;
let authRetryTimer: ReturnType<typeof setTimeout> | null = null;
let authRetryIndex = 0;
let needsAuthRecovery = false;
let refreshedSinceConnect = false;

// A temporary network failure at the exact moment a token expires should not
// permanently kill chat. These retries are bounded so a rejected credential can
// never turn into a tight reconnect/refresh loop.
const AUTH_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

function clearAuthRetry(): void {
  if (authRetryTimer) clearTimeout(authRetryTimer);
  authRetryTimer = null;
}

function applyCurrentToken(target: Socket): boolean {
  const token = getAccessToken();
  if (!token) return false;
  pendingConnectionToken = token;
  target.auth = { token };
  return true;
}

function connectWithCurrentToken(target: Socket): void {
  if (target !== socket || intentionalDisconnect || target.connected || needsAuthRecovery) return;
  if (!applyCurrentToken(target)) return;
  clearAuthRetry();
  target.connect();
}

function scheduleAuthRecovery(target: Socket): void {
  if (target !== socket || intentionalDisconnect || authRetryTimer) return;
  const delay = AUTH_RETRY_DELAYS_MS[authRetryIndex];
  if (delay === undefined) return;
  authRetryIndex += 1;
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null;
    void recoverAuthentication(target, true);
  }, delay);
}

/**
 * A newly issued access token should authenticate on the next handshake. If it
 * does not, retry that same token with bounded backoff instead of rotating the
 * refresh token over and over. Persistent rejection ends the inconsistent local
 * session after the final retry.
 */
function scheduleFreshTokenReconnect(target: Socket): void {
  if (target !== socket || intentionalDisconnect || authRetryTimer) return;
  const delay = AUTH_RETRY_DELAYS_MS[authRetryIndex];
  if (delay === undefined) {
    void expireSession();
    return;
  }
  authRetryIndex += 1;
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null;
    if (target !== socket || intentionalDisconnect) return;
    needsAuthRecovery = false;
    connectWithCurrentToken(target);
  }, delay);
}

/**
 * Reconnect after the server deliberately closes a socket at JWT expiry.
 *
 * If a normal API request already refreshed the token, reconnect immediately
 * with that newer token. Otherwise rotate the refresh token through the same
 * single-flight gate used by HTTP requests, then reconnect. A transient network
 * failure gets bounded backoff; a rejected refresh ends the local session.
 */
function recoverAuthentication(target: Socket, forceRefresh = false): Promise<void> {
  if (target !== socket || intentionalDisconnect || target.connected) return Promise.resolve();
  if (authRecovery && authRecoveryTarget === target) return authRecovery;

  const recovery = (async () => {
    const currentToken = getAccessToken();
    if (!currentToken) return;

    // The token may have been refreshed by HTTP while this handshake or socket
    // was still using the previous one. Reconnect it directly, even when the
    // stale handshake reported an authorization error.
    const attemptedToken = pendingConnectionToken ?? tokenUsedForConnection;
    if (currentToken !== attemptedToken) {
      authRetryIndex = 0;
      needsAuthRecovery = false;
      connectWithCurrentToken(target);
      return;
    }

    if (forceRefresh && refreshedSinceConnect) {
      scheduleFreshTokenReconnect(target);
      return;
    }

    const outcome = await refreshAccessToken();
    if (target !== socket || intentionalDisconnect) return;

    if (outcome === "refreshed") {
      authRetryIndex = 0;
      refreshedSinceConnect = true;
      needsAuthRecovery = false;
      connectWithCurrentToken(target);
    } else if (outcome === "rejected") {
      await expireSession();
    } else if (outcome === "superseded") {
      // Logout/new sign-in won the race with this recovery request. The old
      // socket is discarded by AuthProvider; a current session may reconnect.
      if (getAccessToken()) {
        needsAuthRecovery = false;
        connectWithCurrentToken(target);
      }
    } else {
      scheduleAuthRecovery(target);
    }
  });

  const trackedRecovery = recovery().finally(() => {
    if (authRecovery === trackedRecovery) {
      authRecovery = null;
      authRecoveryTarget = null;
    }
  });
  authRecovery = trackedRecovery;
  authRecoveryTarget = target;

  return trackedRecovery;
}

function createSocket(): Socket {
  intentionalDisconnect = false;
  pendingConnectionToken = getAccessToken();

  const target = io(API_URL, {
    transports: ["websocket"],
    auth: { token: pendingConnectionToken },
    autoConnect: true,
    reconnection: true,
  });

  target.on("connect", () => {
    tokenUsedForConnection = pendingConnectionToken;
    authRetryIndex = 0;
    needsAuthRecovery = false;
    refreshedSinceConnect = false;
    clearAuthRetry();
  });

  target.on("disconnect", (reason) => {
    if (intentionalDisconnect || target !== socket) return;
    // Socket.IO does not automatically reconnect after a server namespace
    // disconnect, which is exactly how the API expires an authenticated socket.
    if (reason === "io server disconnect") {
      needsAuthRecovery = true;
      void recoverAuthentication(target);
    }
  });

  target.on("connect_error", (error) => {
    if (intentionalDisconnect || target !== socket) return;
    if (error.message.toLowerCase().includes("unauthorized")) {
      // Stop Socket.IO retrying the same rejected JWT. Authentication recovery
      // will reconnect once with a newly rotated token.
      needsAuthRecovery = true;
      target.disconnect();
      void recoverAuthentication(target, true);
    }
  });

  // Transport-level reconnects (Wi-Fi changes, sleep/wake) should always use the
  // newest access token, even if HTTP refreshed while the socket was offline.
  target.io.on("reconnect_attempt", () => {
    if (target === socket && !intentionalDisconnect) applyCurrentToken(target);
  });

  return target;
}

/** Lazily connect a single authenticated socket for the session. */
export function getSocket(): Socket {
  if (socket) {
    if (!socket.connected) {
      if (needsAuthRecovery) void recoverAuthentication(socket);
      else connectWithCurrentToken(socket);
    }
    return socket;
  }
  socket = createSocket();
  return socket;
}

export function disconnectSocket() {
  intentionalDisconnect = true;
  clearAuthRetry();
  socket?.disconnect();
  socket = null;
  authRecovery = null;
  authRecoveryTarget = null;
  tokenUsedForConnection = null;
  pendingConnectionToken = null;
  authRetryIndex = 0;
  needsAuthRecovery = false;
  refreshedSinceConnect = false;
}
