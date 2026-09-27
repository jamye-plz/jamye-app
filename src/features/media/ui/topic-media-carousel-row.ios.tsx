import { Button, Host } from "@expo/ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { ScrollView, View } from "react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";

import { ChatroomMediaThumbnail } from "./chatroom-media-thumbnail";

const ITEM_SIZE = 92;

/**
 * D4 iOS carousel row: a plain horizontal scroll of square thumbnails. The
 * Android sibling (`topic-media-carousel-row.android.tsx`) uses Jetpack
 * Compose's `HorizontalMultiBrowseCarousel` instead -- each platform keeps
 * its own native list-scrolling affordance (ADR 0010) rather than sharing one
 * RN-only implementation.
 */
export function TopicMediaCarouselRow({
  items,
  onOpenAll,
}: Readonly<{
  items: readonly ChatroomMediaItem[];
  /** "모두 보기" -> the grid route. */
  onOpenAll: () => void;
}>) {
  const { colors } = useAppTheme();
  return (
    <>
      <ScrollView
        accessibilityLabel="최근 갤러리 항목"
        contentContainerStyle={{
          gap: appSpacing.sm,
          paddingHorizontal: appSpacing.md,
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="topic-media-carousel-row"
      >
        {items.map((item) => (
          <View key={item.id} style={{ height: ITEM_SIZE, width: ITEM_SIZE }}>
            <ChatroomMediaThumbnail item={item} size={ITEM_SIZE} />
          </View>
        ))}
      </ScrollView>
      {/* A tinted borderless button on the row inset, the iOS form of a
          "see all" action inside a grouped section. */}
      <Host
        matchContents
        seedColor={colors.primary}
        style={{
          alignSelf: "flex-start",
          marginHorizontal: appSpacing.md,
          minHeight: 44,
        }}
      >
        <Button
          label="모두 보기"
          modifiers={[buttonStyle("borderless")]}
          onPress={onOpenAll}
          variant="text"
        />
      </Host>
    </>
  );
}
