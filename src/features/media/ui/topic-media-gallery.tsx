import { Host } from "@expo/ui";
import { useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { StandardStateViewErrorRow } from "@/shared/ui/standard-state-view";

import { useChatroomGallery } from "../model/use-chatroom-gallery";
import { TopicMediaCarouselRow } from "./topic-media-carousel-row";

const CAROUSEL_LIMIT = 12;

/**
 * D4/E10 topic-detail gallery section: a "갤러리" `GroupedSection` holding a
 * recent-items carousel (platform split in
 * `topic-media-carousel-row.{ios,android}.tsx`) and a "모두 보기" button into
 * the 3-col grid route (`chatroom-media-grid-screen.tsx`, mounted at
 * `src/app/groups/[groupId]/topics/[topicId]/gallery.tsx`). This is the one
 * new line `topic-detail-screen.tsx` renders for the gallery feature -- see
 * that file's own docblock, which the task-app-topics agent owns.
 */
export function TopicMediaGallery({
  groupId,
  topicId,
  chatroomId,
}: Readonly<{
  groupId: string;
  topicId: string;
  chatroomId: string;
}>) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const gallery = useChatroomGallery(chatroomId);
  const openGallery = () =>
    router.push({
      params: { chatroomId, groupId, topicId },
      pathname: "/groups/[groupId]/topics/[topicId]/gallery",
    });

  return (
    <GroupedSection title="갤러리">
      {gallery.status === "loading" && gallery.items.length === 0 ? (
        <View
          accessibilityLabel="갤러리 불러오는 중"
          style={{ alignItems: "center", padding: 12 }}
          testID="topic-media-gallery-loading"
        >
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : gallery.status === "error" && gallery.items.length === 0 ? (
        // The error row is a SwiftUI/Compose node and needs its own Host.
        <Host matchContents={{ vertical: true }} seedColor={colors.primary}>
          <StandardStateViewErrorRow
            message={gallery.errorMessage ?? "갤러리를 불러오지 못했습니다."}
            onRetry={gallery.refresh}
            testID="topic-media-gallery-error"
          />
        </Host>
      ) : gallery.items.length === 0 ? (
        <AppText
          color={colors.textMuted}
          style={{
            paddingHorizontal: appSpacing.md,
            paddingVertical: appSpacing.sm,
          }}
          testID="topic-media-gallery-empty"
        >
          대화방에 올린 사진과 동영상이 여기에 모여요
        </AppText>
      ) : (
        <View
          style={{ gap: appSpacing.xs, paddingTop: appSpacing.sm }}
          testID="topic-media-gallery-content"
        >
          <TopicMediaCarouselRow
            items={gallery.items.slice(0, CAROUSEL_LIMIT)}
            onOpenAll={openGallery}
          />
        </View>
      )}
    </GroupedSection>
  );
}
