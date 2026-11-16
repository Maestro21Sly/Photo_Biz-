import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * True when the user has asked the OS to reduce motion.
 *
 * iOS/Android expose this directly. On web, RN-web's implementation does not
 * cover `prefers-reduced-motion`, so we read the media query ourselves — a
 * browser user who has set that preference gets the same treatment.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (Platform.OS === "web") {
      if (typeof window === "undefined" || !window.matchMedia) return;
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
      // Safari <14 only has the deprecated addListener signature.
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else mq.addListener(onChange);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener("change", onChange);
        else mq.removeListener(onChange);
      };
    }

    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * Scales a duration to 0 when reduce-motion is on. Passing 0 to Animated /
 * expo-image `transition` makes the change instant rather than removing it,
 * which keeps every call site a one-liner.
 */
export function motionDuration(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}
