import type { AndroidSymbol, SFSymbol, SymbolWeight } from "expo-symbols";
import { SymbolView } from "expo-symbols";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

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
  | "check";

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
};

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
  const accessible = !!accessibilityLabel;
  return (
    <SymbolView
      accessibilityElementsHidden={!accessible}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      fallback={<View style={{ height: size, width: size }} />}
      importantForAccessibility={accessible ? "auto" : "no"}
      name={APP_SYMBOLS[name]}
      resizeMode="scaleAspectFit"
      size={size}
      style={style}
      tintColor={tintColor ?? colors.text}
      weight={weight}
    />
  );
}
