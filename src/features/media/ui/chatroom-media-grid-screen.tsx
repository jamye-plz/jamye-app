import { Host } from "@expo/ui";
import type { ReactNode } from "react";
import {
  FlatList,
  RefreshControl,
  useWindowDimensions,
  View,
} from "react-native";

import type { ChatroomMediaItem } from "@/core/contracts/server/media";
import { useAppTheme } from "@/core/theme/theme-provider";
import { StandardStateView } from "@/shared/ui/standard-state-view";

import { useChatroomGallery } from "../model/use-chatroom-gallery";
import { ChatroomMediaThumbnail } from "./chatroom-media-thumbnail";

const COLUMNS = 3;
const GRID_GAP = 2;

/**
 * D4 "모두 보기" destination: a virtualized 3-column square grid over the same
 * C5 gallery hook the topic-detail carousel section uses (`useChatroomGallery`),
 * with pull-to-refresh and end-of-list pagination. Item tap opens the same
 * viewer path `ChatroomMediaThumbnail` already wires up (MediaImage's own
 * `MediaImageViewer` for photos; `MediaViewerModal` + `NativeVideoPlayer` for
 * videos) -- this screen never opens a viewer itself.
 */
export function ChatroomMediaGridScreen({
  chatroomId,
}: Readonly<{
  chatroomId: string;
}>) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const cellSize = Math.floor((width - GRID_GAP * (COLUMNS - 1)) / COLUMNS);
  const gallery = useChatroomGallery(chatroomId);

  // State views are SwiftUI/Compose nodes and need their own Host.
  const hosted = (stateView: ReactNode) => (
    <Host seedColor={colors.primary} style={{ flex: 1 }}>
      {stateView}
    </Host>
  );

  if (gallery.status === "loading" && gallery.items.length === 0) {
    return hosted(
      <StandardStateView kind="loading" testID="chatroom-media-grid-loading" />,
    );
  }
  if (gallery.status === "error" && gallery.items.length === 0) {
    return hosted(
      <StandardStateView
        actions={[
          { label: "다시 시도", onPress: gallery.refresh, primary: true },
        ]}
        description={gallery.errorMessage ?? undefined}
        kind="error"
        systemImage="error"
        testID="chatroom-media-grid-error"
        title="갤러리를 불러오지 못했습니다."
      />,
    );
  }
  if (gallery.items.length === 0) {
    return hosted(
      <StandardStateView
        description="대화방에 올린 사진과 동영상이 여기에 모여요"
        kind="empty"
        systemImage="gallery"
        testID="chatroom-media-grid-empty"
        title="아직 사진·동영상이 없어요"
      />,
    );
  }

  return (
    <FlatList
      columnWrapperStyle={{ gap: GRID_GAP }}
      contentContainerStyle={{ gap: GRID_GAP }}
      contentInsetAdjustmentBehavior="automatic"
      data={gallery.items}
      keyExtractor={(item: ChatroomMediaItem) => item.id}
      numColumns={COLUMNS}
      onEndReached={gallery.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={gallery.refresh}
          refreshing={gallery.status === "refreshing"}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }: { item: ChatroomMediaItem }) => (
        <View style={{ height: cellSize, width: cellSize }}>
          <ChatroomMediaThumbnail item={item} size={cellSize} />
        </View>
      )}
      testID="chatroom-media-grid-list"
    />
  );
}
