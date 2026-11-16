import React from "react";
import { useWindowDimensions } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme";
import { useThreadUnreadCount } from "../../src/lib/queries";
import { haptics } from "../../src/lib/haptics";

type TabDef = {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  hint: string;
};

const TABS: TabDef[] = [
  {
    name: "index",
    title: "Discover",
    icon: "compass-outline",
    iconActive: "compass",
    hint: "Browse and search photographers",
  },
  {
    name: "saved",
    title: "Saved",
    icon: "heart-outline",
    iconActive: "heart",
    hint: "Photographers you've saved",
  },
  {
    name: "bookings",
    title: "Bookings",
    icon: "calendar-outline",
    iconActive: "calendar",
    hint: "Your shoot requests and their status",
  },
  {
    name: "messages",
    title: "Messages",
    icon: "chatbubble-outline",
    iconActive: "chatbubble",
    hint: "Your conversations",
  },
  {
    name: "profile",
    title: "Profile",
    icon: "person-outline",
    iconActive: "person",
    hint: "Your account and profile settings",
  },
];

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const messageUnread = useThreadUnreadCount();

  // A bottom tab bar has a fixed height, so at large accessibility font sizes
  // the labels would clip. Past ~130% we drop to icons only and lean on the
  // per-tab accessibility labels, which is what the OS reads out anyway.
  const showLabel = fontScale <= 1.3;

  /**
   * Base height, before the safe-area inset is added.
   *
   * Measured against what the bar actually contains rather than picked to look
   * right on one device. With labels the budget is:
   *
   *   6  paddingTop (below)
   * + 2  React Navigation item paddingVertical      (x2)
   * + 5  React Navigation tab button padding        (x2)
   * + 24 icon
   * + 4  React Navigation's label marginTop
   * + 14 label lineHeight
   * = 62, rounded to 64 for a little slack.
   *
   * The bar used to be 56. Because the label sits in a flex-shrinkable box with
   * `overflow: hidden`, that 6pt shortfall did not push the bar taller — it
   * sliced the descenders off every label. It went unnoticed because
   * `insets.bottom` is 34 on a notched iPhone and quietly absorbed the deficit;
   * it only shows up where the bottom inset is 0, i.e. the web build and
   * Android devices with hardware navigation keys.
   */
  const ICON_SIZE = showLabel ? 24 : 28;
  const baseHeight = showLabel ? 64 : 52;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.textFaint,
        tabBarShowLabel: showLabel,
        tabBarStyle: {
          backgroundColor: t.colors.tabBar,
          borderTopColor: t.colors.tabBarBorder,
          borderTopWidth: 1,
          // Clears the iOS home indicator and the Android gesture/3-button bar.
          height: baseHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          // The default elevation paints a grey shadow over dark surfaces.
          elevation: 0,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        // An explicit lineHeight makes the label's height deterministic instead
        // of font-metric-dependent, which is what the height maths above assumes.
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
        tabBarAllowFontScaling: false,
        tabBarBadgeStyle: {
          backgroundColor: t.colors.accent,
          color: t.colors.onAccent,
          fontSize: 11,
          fontWeight: "700",
        },
        sceneStyle: { backgroundColor: t.colors.bg },
      }}
    >
      {TABS.map((tab) => {
        // Only Messages carries a count today; notifications live in the
        // Discover header bell so the two badges never compete.
        const badgeCount = tab.name === "messages" ? messageUnread : 0;
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            listeners={{
              // Light selection tick on tab change, matching the OS feel.
              tabPress: () => haptics.selection(),
            }}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarButtonTestID: `tab-${tab.name}`,
              tabBarBadge: badgeCount > 0 ? (badgeCount > 99 ? "99+" : badgeCount) : undefined,
              // `size` from React Navigation is deliberately ignored: it differs
              // between platforms, which would make the height budget above a
              // guess. Icons carry the whole tab when labels are hidden, so they
              // grow in that mode.
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? tab.iconActive : tab.icon} color={color} size={ICON_SIZE} />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
