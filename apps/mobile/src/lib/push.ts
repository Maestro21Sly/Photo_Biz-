import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { api } from "./api";

/**
 * Best-effort Expo push registration. No-op on web and on simulators without
 * permission. Failures are swallowed so they never block the app.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId || projectId.startsWith("REPLACE_")) return; // set after `eas init`
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) await api("/auth/push-token", { method: "PUT", body: { pushToken: token } });
  } catch {
    /* push is optional */
  }
}
