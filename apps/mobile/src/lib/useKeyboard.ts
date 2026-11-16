import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * True while the software keyboard is on screen.
 *
 * Needed because `KeyboardAvoidingView behavior="padding"` already pads by the
 * full keyboard height — which on iOS *includes* the home-indicator area. A
 * composer that also pads by `insets.bottom` therefore floats too high once the
 * keyboard opens. Screens use this to drop their own bottom inset while the
 * keyboard is up and restore it when it closes.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS emits the `Will` events early enough to animate in step with the
    // keyboard; Android only reliably emits `Did`.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
