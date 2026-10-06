import type { AndroidSymbol, SFSymbol, SymbolWeight } from "expo-symbols";
import { SymbolView } from "expo-symbols";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";
import { useWindowDimensions, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";

export type AppSymbolName =
  | "account"
  | "add"
  | "more"
  | "refresh"
  | "send"
  | "attach"
  | "photo"
  | "audio"
  | "play"
  | "share"
  | "close"
  | "edit"
  | "delete"
  | "leave"
  | "chat"
  | "group"
  | "tag"
  | "error"
  | "chevron"
  | "back"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "inbox"
  | "image"
  | "check"
  | "notification"
  | "info"
  | "invite"
  | "removeMember"
  | "gallery"
  | "hashtag"
  | "videoPlay"
  | "groupAdd"
  | "emptyGroups"
  | "emptyTopics"
  | "microphone"
  | "stop"
  | "pause"
  | "copy"
  | "markRead"
  | "newTopic"
  | "newMessage"
  | "scrollDown";

export const APP_SYMBOLS: Record<
  AppSymbolName,
  { ios: SFSymbol; android: AndroidSymbol }
> = {
  account: { ios: "person.crop.circle", android: "account_circle" },
  add: { ios: "plus", android: "add" },
  more: { ios: "ellipsis.circle", android: "more_vert" },
  refresh: { ios: "arrow.clockwise", android: "refresh" },
  send: { ios: "arrow.up", android: "send" },
  attach: { ios: "plus.circle.fill", android: "add_circle" },
  photo: { ios: "photo.on.rectangle", android: "image" },
  audio: { ios: "waveform", android: "audio_file" },
  play: { ios: "play.circle.fill", android: "play_circle" },
  share: { ios: "square.and.arrow.up", android: "share" },
  close: { ios: "xmark", android: "close" },
  edit: { ios: "pencil", android: "edit" },
  delete: { ios: "trash", android: "delete" },
  leave: { ios: "rectangle.portrait.and.arrow.right", android: "logout" },
  chat: { ios: "bubble.left.and.bubble.right", android: "forum" },
  group: { ios: "person.2", android: "group" },
  tag: { ios: "tag", android: "label" },
  error: { ios: "exclamationmark.triangle", android: "error" },
  chevron: { ios: "chevron.right", android: "chevron_right" },
  back: { ios: "chevron.left", android: "arrow_back" },
  zoomIn: { ios: "plus.magnifyingglass", android: "zoom_in" },
  zoomOut: { ios: "minus.magnifyingglass", android: "zoom_out" },
  fit: { ios: "arrow.up.left.and.arrow.down.right", android: "fit_screen" },
  inbox: { ios: "tray", android: "inbox" },
  image: { ios: "photo", android: "image" },
  check: { ios: "checkmark", android: "check" },
  notification: { ios: "bell", android: "notifications" },
  info: { ios: "info.circle", android: "info" },
  invite: { ios: "ticket", android: "confirmation_number" },
  // M14 round 1 (task-app-kit): pre-registered for the groups/topics page
  // tasks; "gallery"/"hashtag" are deliberately distinct from the existing
  // "photo"/"tag" entries above (different Android glyph).
  removeMember: { ios: "person.badge.minus", android: "person_remove" },
  gallery: { ios: "photo.on.rectangle", android: "photo_library" },
  hashtag: { ios: "number", android: "tag" },
  videoPlay: { ios: "play.fill", android: "play_arrow" },
  groupAdd: { ios: "person.2.badge.plus", android: "group_add" },
  // Empty-list icons (G4, T6): alias the existing "group"/"chat" glyphs so
  // callers get a self-documenting name without a duplicate drawable.
  emptyGroups: { ios: "person.2", android: "group" },
  emptyTopics: { ios: "bubble.left.and.bubble.right", android: "forum" },
  // M14 round 2 (task-app-kit): voice recording, message actions, and
  // notification-row affordances for the round-2 screen tasks.
  microphone: { ios: "mic", android: "mic" },
  stop: { ios: "stop.fill", android: "stop" },
  pause: { ios: "pause.fill", android: "pause" },
  copy: { ios: "doc.on.doc", android: "content_copy" },
  markRead: { ios: "envelope.open", android: "mark_email_read" },
  newTopic: { ios: "doc.text", android: "article" },
  newMessage: { ios: "bubble.left", android: "chat" },
  scrollDown: { ios: "arrow.down", android: "arrow_downward" },
};

/**
 * expo-symbols' Android `SymbolView` draws the Material Symbols glyph with a
 * plain RN `<Text fontSize={size} lineHeight={size}>` that keeps the
 * default `allowFontScaling`, while the surrounding box stays a fixed
 * `{size, size}` View (see expo-symbols' SymbolView.js) -- at large system
 * font scales (e.g. 200%) the glyph outgrows that box and clips, as seen on
 * the group-name rename pencil. Asking SymbolView for `size / fontScale`
 * makes RN scale the glyph back up to the nominal size; pinning the box's
 * own style to the nominal size keeps layout unchanged. iOS's native SF
 * Symbols aren't affected, so `os !== "android"` is always a no-op.
 *
 * Exported as a pure function taking `os` explicitly (same shape as
 * `resolveThemeColorForOs` in core/theme/tokens.ts) because jest-expo's
 * babel transform inlines `process.env.EXPO_OS` to the literal "ios" for
 * the whole test bundle, so the "android" branch can never be observed by
 * rendering under jest -- this lets the Android math be unit-tested
 * directly (see tests/shared/ui/app-symbol.test.tsx).
 */
export function symbolViewSizing(
  os: string | undefined,
  size: number,
  fontScale: number,
): { size: number; style: StyleProp<ViewStyle> } {
  if (os !== "android") return { size, style: null };
  return { size: size / fontScale, style: { height: size, width: size } };
}

export function AppSymbol({
  name,
  size = 24,
  tintColor,
  weight = "regular",
  style,
  accessibilityLabel,
}: Readonly<{
  name: AppSymbolName;
  size?: number;
  tintColor?: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
  const { colors } = useAppThemeOrSystem();
  const { fontScale } = useWindowDimensions();
  const accessible = !!accessibilityLabel;
  const sizing = symbolViewSizing(process.env.EXPO_OS, size, fontScale);
  return (
    <SymbolView
      accessibilityElementsHidden={!accessible}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      fallback={<View style={{ height: size, width: size }} />}
      importantForAccessibility={accessible ? "auto" : "no"}
      name={APP_SYMBOLS[name]}
      resizeMode="scaleAspectFit"
      size={sizing.size}
      style={sizing.style ? [sizing.style, style] : style}
      tintColor={tintColor ?? colors.text}
      weight={weight}
    />
  );
}
