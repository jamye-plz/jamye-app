import { Host } from "@expo/ui";
import {
  HorizontalMultiBrowseCarousel,
  RNHostView,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize, height } from "@expo/ui/jetpack-compose/modifiers";
import { View } from "react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import { NativeButton } from "@/shared/ui/native-button";

import { ChatroomMediaThumbnail } from "./chatroom-media-thumbnail";

const ITEM_SIZE = 92;

/**
 * D4 Android (+ fallback) carousel row: Jetpack Compose Material3
 * `HorizontalMultiBrowseCarousel` (`@expo/ui/jetpack-compose`), hosted the
 * same way `topic-detail-screen.tsx` hosts its own Compose header controls.
 * This is the bare/default file (no `.android.tsx` sibling, matching
 * `topic-tags-view.tsx`'s own default-is-Android split): Metro resolves it
 * directly on Android, and `topic-media-carousel-row.ios.tsx` overrides it on
 * iOS with a plain RN horizontal ScrollView instead. `tsc`'s bare-specifier
 * module resolution needs this file to exist even though Metro would also
 * accept an `.android.tsx`-only split.
 */
export function TopicMediaCarouselRow({
  items,
  onOpenAll,
}: Readonly<{
  items: readonly ChatroomMediaItem[];
  /** "모두 보기" -> the grid route. */
  onOpenAll: () => void;
}>) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  // Vertical-only: the carousel is a pager and must be measured with a
  // bounded width (a horizontal match would crash Compose).
  return (
    <>
      <Host matchContents={{ vertical: true }} seedColor={hex.primary}>
        <HorizontalMultiBrowseCarousel
          contentPadding={{ end: 16, start: 16 }}
          itemSpacing={8}
          modifiers={[height(ITEM_SIZE)]}
          preferredItemWidth={ITEM_SIZE}
        >
          {/* Each item hosts its thumbnail at the item's current size (the
              carousel narrows items as they scroll), so the thumbnail's own
              rounded corners stand in for M3's item mask, which does not reach
              React Native content. */}
          {items.map((item) => (
            <RNHostView key={item.id} modifiers={[fillMaxSize()]}>
              <View style={{ flex: 1 }}>
                <ChatroomMediaThumbnail fill item={item} size={ITEM_SIZE} />
              </View>
            </RNHostView>
          ))}
        </HorizontalMultiBrowseCarousel>
      </Host>
      <NativeButton label="모두 보기" onPress={onOpenAll} variant="text" />
    </>
  );
}
