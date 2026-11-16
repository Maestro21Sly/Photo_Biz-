import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Haptics with a house style, so feedback stays consistent and never fires
 * where the platform wouldn't.
 *
 * Rules we follow:
 *  - Web has no haptics API worth using — every call is a no-op there.
 *  - Android's impact styles are coarse; Expo maps them sensibly, so we still
 *    call through rather than branching.
 *  - Selection feedback for picking from a set (chips, sort, stars).
 *  - Impact for a committed action (favourite, send, submit).
 *  - Notification for the outcome of a request (success / error).
 *  - Every call is fire-and-forget: a rejected promise must never surface.
 */
const enabled = Platform.OS === "ios" || Platform.OS === "android";

function run(fn: () => Promise<unknown>) {
  if (!enabled) return;
  fn().catch(() => {
    /* haptics are decorative — never let them throw into a handler */
  });
}

export const haptics = {
  /** Moving between options: filter chips, sort, tab, star rating. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** A light confirmation: toggling a favourite, sending a message. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A weightier commit: submitting a booking, accepting a request. */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Request succeeded. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Request failed / validation blocked. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Something needs attention but isn't an outright failure. */
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
