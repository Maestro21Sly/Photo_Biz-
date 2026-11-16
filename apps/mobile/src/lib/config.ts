import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Base URL of the SnapCampus API. Override per-environment via app.json
 * `expo.extra.apiUrl` or the EXPO_PUBLIC_API_URL env var.
 *
 * Note: on a physical device, "localhost" points at the phone, not your Mac —
 * set EXPO_PUBLIC_API_URL to your machine's LAN IP (e.g. http://192.168.1.20:4000).
 */
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const fromEnv = process.env.EXPO_PUBLIC_API_URL;

// Android emulator reaches the host machine via 10.0.2.2 instead of localhost.
const fallback =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";

export const API_URL = (fromEnv || fromExtra || fallback).replace(/\/$/, "");
export const API_BASE = `${API_URL}/api/v1`;

// Legal pages are served by the API so the App Store privacy URL always resolves.
export const TERMS_URL = `${API_URL}/legal/terms`;
export const PRIVACY_URL = `${API_URL}/legal/privacy`;
