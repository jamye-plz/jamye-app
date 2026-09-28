import { ListItem, RNHostView, Text } from "@expo/ui";
import { useWindowDimensions, View } from "react-native";

import { useAccountScope } from "@/core/providers/app-providers";
import { ConnectionDiagnostics } from "@/features/home/ui/connection-diagnostics";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import {
  describePushState,
  maskExpoToken,
} from "@/features/notifications/ui/notification-settings-section.shared";
import { ListSubheader } from "@/shared/ui/list-subheader";

const STORAGE_STATUS_TEXT: Record<string, string> = {
  error: "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
  opening: "로컬 계정 저장소 준비 중…",
  ready: "로컬 계정 저장소 준비됨",
};

/**
 * A3 (`__DEV__`-only, Android): mirrors `developer-section.ios.tsx` with a
 * `ListSubheader` instead of a `Section` title.
 */
export function DeveloperSection() {
  const account = useAccountScope();
  const { width: windowWidth } = useWindowDimensions();
  const { expoToken, state } = usePushLifecycle();
  const storageStatus = account.state?.status ?? "opening";

  return (
    <>
      <ListSubheader testID="developer-section-header">개발자</ListSubheader>
      <ListItem
        supportingText={STORAGE_STATUS_TEXT[storageStatus]}
        testID="dev-storage-row"
      >
        <Text>계정 저장소</Text>
      </ListItem>
      {storageStatus === "error" ? (
        <ListItem onPress={account.retry} testID="dev-storage-retry-row">
          <Text>계정 저장소 다시 시도</Text>
        </ListItem>
      ) : null}
      {/* The RN diagnostics block is a content-sized list item with the
          full row width, so its text wraps inside the 16dp inset instead
          of overflowing a ListItem slot (DESIGN.md §4). */}
      <RNHostView matchContents>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            width: windowWidth,
          }}
          testID="dev-connection-row"
        >
          <ConnectionDiagnostics />
        </View>
      </RNHostView>
      <ListItem
        supportingText={maskExpoToken(expoToken)}
        testID="dev-push-token-row"
      >
        <Text>푸시 토큰</Text>
      </ListItem>
      <ListItem
        supportingText={describePushState(state)}
        testID="dev-push-diagnostic-row"
      >
        <Text>푸시 진단</Text>
      </ListItem>
    </>
  );
}
