import { Host } from "@expo/ui";
import {
  HorizontalMultiBrowseCarousel,
  RNHostView,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize, height } from "@expo/ui/jetpack-compose/modifiers";
import { View } from "react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appRadii } from "@/core/theme/tokens";
import { NativeButton } from "@/shared/ui/native-button";

import { ChatroomMediaThumbnail } from "./chatroom-media-thumbnail";

const ITEM_SIZE = 92;

/**
 * D4 Android carousel row: Jetpack Compose Material3
 * `HorizontalMultiBrowseCarousel` (`@expo/ui/jetpack-compose`), hosted the
 * same way `topic-detail-screen.tsx` hosts its own Compose header controls.
 * `topic-media-carousel-row.ios.tsx` is the iOS sibling (a plain RN
 * horizontal ScrollView instead); `topic-media-carousel-row.tsx` is a bare
 * re-export of this file kept only so `tsc`'s bare-specifier resolution
 * (`topic-media-gallery.tsx`'s `from "./topic-media-carousel-row"`) still
 * type-checks -- this project's tsconfig sets no `moduleSuffixes` (see that
 * file, and `platform/player.ts` for the identical precedent).
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
          {items.map((item) => (
            <RNHostView key={item.id} modifiers={[fillMaxSize()]}>
              {/* E7e: M3's own item mask (the carousel's rounded clip that
                  grows as an item shrinks toward the scroll edges) does not
                  reach RN content hosted through RNHostView, so a shrunken
                  item's thumbnail showed square corners on device. This
                  wrapper applies a fixed 12dp (appRadii.medium) radius +
                  clip directly to the RN content as an app-code
                  approximation -- it does not track Compose's own per-item
                  radius as an item shrinks during a scroll, which is the
                  recorded limitation for this fix (no @expo/ui item-mask
                  API exists to match it exactly without a native rebuild). */}
              <View
                style={{
                  borderRadius: appRadii.medium,
                  flex: 1,
                  overflow: "hidden",
                }}
              >
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
