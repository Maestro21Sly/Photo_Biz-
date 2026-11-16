import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, FlatList, Platform, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardScreen, ScreenHeader, useContentWidth } from "../../src/components/Screen";
import { EmptyState, Skeleton, Touchable } from "../../src/components/ui";
import { useToast } from "../../src/components/Toast";
import { useMessages } from "../../src/lib/queries";
import { api } from "../../src/lib/api";
import { getSocket } from "../../src/lib/socket";
import { haptics } from "../../src/lib/haptics";
import { useKeyboardVisible } from "../../src/lib/useKeyboard";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";
import type { ChatMessage } from "../../src/types";

/** A message is "in the same breath" as the previous one within five minutes. */
const RUN_GAP_MS = 5 * 60 * 1000;

interface Row {
  message: ChatMessage;
  /** Day heading rendered above this bubble, when the date changes. */
  dayLabel: string | null;
  /** Last bubble of a run — only these carry a timestamp. */
  showTime: boolean;
  /** First bubble of a run — only these get the pointed corner. */
  startsRun: boolean;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/**
 * Groups a flat message list into render rows: day headings, message runs and
 * trailing timestamps. Done once per data change rather than per row, so the
 * list's `renderItem` stays trivial.
 */
function buildRows(messages: ChatMessage[]): Row[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const at = new Date(m.createdAt).getTime();

    const startsRun =
      !prev ||
      prev.mine !== m.mine ||
      at - new Date(prev.createdAt).getTime() > RUN_GAP_MS;

    const showTime =
      !next ||
      next.mine !== m.mine ||
      new Date(next.createdAt).getTime() - at > RUN_GAP_MS;

    const showDay =
      !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();

    return { message: m, dayLabel: showDay ? dayLabel(new Date(m.createdAt)) : null, showTime, startsRun };
  });
}

export default function Chat() {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const contentWidth = useContentWidth();
  const { threadId, name } = useLocalSearchParams<{ threadId: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useMessages(threadId);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const optimisticCounter = useRef(0);

  useEffect(() => {
    if (data?.items) {
      setMessages(data.items);
      // Opening the thread marks incoming messages read server-side; refresh the
      // conversation list so its unread badge clears immediately.
      qc.invalidateQueries({ queryKey: ["threads"] });
    }
  }, [data?.items, qc]);

  // Realtime: append messages pushed to this thread.
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (m: {
      id: string;
      threadId: string;
      body: string;
      senderId: string;
      createdAt: string;
    }) => {
      if (m.threadId !== threadId) return;
      setMessages((prev) =>
        prev.some((x) => x.id === m.id)
          ? prev
          : [...prev, { id: m.id, body: m.body, senderId: m.senderId, mine: false, createdAt: m.createdAt }]
      );
      haptics.tap();
    };
    socket.on("message", onMessage);
    return () => {
      socket.off("message", onMessage);
      qc.invalidateQueries({ queryKey: ["threads"] });
    };
  }, [threadId, qc]);

  /**
   * Inverted list. This is the standard chat pattern for a reason: new messages
   * land at the visual bottom with no `scrollToEnd` call, so the view never
   * jumps while you're reading history, and pagination would grow off-screen.
   */
  const rows = useMemo(() => buildRows(messages).reverse(), [messages]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    setSending(true);
    haptics.tap();

    const optimistic: ChatMessage = {
      id: `tmp-${++optimisticCounter.current}`,
      body,
      senderId: "me",
      mine: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await api<ChatMessage>(`/threads/${threadId}/messages`, {
        method: "POST",
        body: { body },
      });
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...saved, mine: true } : m)));
    } catch {
      // Roll the optimistic bubble back and hand the text to the user rather
      // than leaving a message that looks sent but isn't.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      haptics.error();
      toast("Message didn't send — tap send to try again", "error");
    } finally {
      setSending(false);
    }
  }, [draft, sending, threadId, toast]);

  const renderItem = useCallback(({ item }: { item: Row }) => <Bubble row={item} />, []);
  const canSend = draft.trim().length > 0;

  return (
    <KeyboardScreen>
      <ScreenHeader title={name ?? "Conversation"} onBack={() => router.back()} />

      {isLoading ? (
        <View style={[styles.list, contentWidth, { gap: t.spacing.md }]}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              height={i % 2 === 0 ? 44 : 62}
              width={i % 2 === 0 ? "62%" : "74%"}
              radius={t.radius.lg}
              style={{ alignSelf: i % 2 === 0 ? "flex-start" : "flex-end" }}
            />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          inverted
          keyExtractor={(r) => r.message.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, contentWidth]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          initialNumToRender={16}
          maxToRenderPerBatch={12}
          windowSize={11}
          removeClippedSubviews={Platform.OS === "android"}
          ListEmptyComponent={
            <View>
              <EmptyState
                icon={isError ? "cloud-offline-outline" : "chatbubble-ellipses-outline"}
                title={isError ? "Couldn't load messages" : "Say hello"}
                body={
                  isError
                    ? "Check your connection and try again."
                    : `Ask about availability, pricing, or what you have in mind for the shoot.`
                }
                actionLabel={isError ? "Try again" : undefined}
                onAction={isError ? refetch : undefined}
              />
            </View>
          }
        />
      )}

      <View
        style={[
          styles.composer,
          // KeyboardAvoidingView already pads by the full keyboard height on
          // iOS, so adding the home-indicator inset on top would float the bar.
          { paddingBottom: keyboardVisible ? t.spacing.sm : insets.bottom + t.spacing.sm },
        ]}
      >
        <View style={[styles.composerInner, contentWidth]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={t.colors.textFaint}
            style={styles.input}
            multiline
            accessibilityLabel="Message text"
            selectionColor={t.colors.accent}
            keyboardAppearance={t.isDark ? "dark" : "light"}
            // Multiline: Enter inserts a newline on every platform and the send
            // button is the single, predictable way to send. Wiring Enter to
            // submit behaves differently in a browser textarea than on iOS and
            // costs users their line breaks.
            submitBehavior="newline"
          />
          <Touchable
            onPress={send}
            disabled={!canSend || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend || sending }}
            style={[styles.sendBtn, (!canSend || sending) && { opacity: 0.4 }]}
            scaleOnPress
          >
            <Ionicons name="arrow-up" size={20} color={t.colors.onAccent} />
          </Touchable>
        </View>
      </View>
    </KeyboardScreen>
  );
}

const Bubble = memo(function Bubble({ row }: { row: Row }) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { message: m, showTime, startsRun, dayLabel: day } = row;
  const pending = m.id.startsWith("tmp-");

  const time = pending
    ? "Sending…"
    : new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    /*
     * No counter-transform here, deliberately.
     *
     * `inverted` flips the scroll container with `scaleY(-1)` — but
     * VirtualizedListCellRenderer already composes that same transform onto
     * every cell wrapper, so rows come out upright on their own. Adding a
     * manual flip made it three transforms deep and rendered every message
     * bubble upside-down and mirrored, on web and native alike.
     */
    <View>
      {day ? (
        <View style={styles.dayWrap}>
          <Text style={styles.dayLabel} maxFontSizeMultiplier={t.layout.maxFontScale}>
            {day}
          </Text>
        </View>
      ) : null}

      <View style={[styles.bubbleRow, m.mine ? styles.rowMine : styles.rowTheirs]}>
        <View style={[styles.bubbleWrap, { alignItems: m.mine ? "flex-end" : "flex-start" }]}>
          <View
            style={[
              styles.bubble,
              m.mine ? styles.bubbleMine : styles.bubbleTheirs,
              startsRun ? null : m.mine
                ? { borderTopRightRadius: t.radius.lg }
                : { borderTopLeftRadius: t.radius.lg },
            ]}
            accessible
            accessibilityLabel={`${m.mine ? "You said" : "They said"}: ${m.body}. ${time}`}
          >
            <Text style={[styles.bubbleText, m.mine && { color: t.colors.onAccent }]} selectable>
              {m.body}
            </Text>
          </View>
          {showTime ? (
            <Text
              style={[styles.timestamp, m.mine ? { textAlign: "right" } : null]}
              maxFontSizeMultiplier={t.layout.maxFontScale}
              // Already inside the bubble's own label.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {time}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  list: { padding: t.spacing.lg, gap: 3, flexGrow: 1 },
  dayWrap: { alignItems: "center", paddingVertical: t.spacing.md },
  dayLabel: {
    ...t.type.caption,
    color: t.colors.textMuted,
    backgroundColor: t.colors.surfaceMuted,
    paddingHorizontal: t.spacing.md,
    paddingVertical: 4,
    borderRadius: t.radius.pill,
    overflow: "hidden",
  },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubbleWrap: { maxWidth: "80%" },
  bubble: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.lg,
  },
  bubbleMine: { backgroundColor: t.colors.accent, borderBottomRightRadius: 6 },
  bubbleTheirs: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { ...t.type.body, color: t.colors.text },
  timestamp: { ...t.type.caption, color: t.colors.textFaint, marginTop: 3, marginHorizontal: 4 },

  composer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.sm,
  },
  composerInner: { flexDirection: "row", alignItems: "flex-end", gap: t.spacing.sm },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: t.layout.touchTarget,
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.md,
    ...t.type.body,
    color: t.colors.text,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  sendBtn: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
