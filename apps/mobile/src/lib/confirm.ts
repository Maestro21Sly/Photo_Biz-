import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 *
 * `Alert.alert` is a no-op in react-native-web — buttons never render and the
 * callback never fires, so on the web build "Decline booking" and "Delete
 * account" silently did nothing. This routes web to the browser's own
 * confirm() and keeps the native alert everywhere else, behind one promise.
 */
export function confirm({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !window.confirm) return Promise.resolve(false);
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
