import { ListItem, RNHostView } from "@expo/ui";
import { Section, Text } from "@expo/ui/swift-ui";

import { useAccountScope } from "@/core/providers/app-providers";
import { ConnectionDiagnostics } from "@/features/home/ui/connection-diagnostics";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import {
  describePushState,
  maskExpoToken,
} from "@/features/notifications/ui/notification-settings-section.shared";

const STORAGE_STATUS_TEXT: Record<string, string> = {
  error: "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
  opening: "로컬 계정 저장소 준비 중…",
  ready: "로컬 계정 저장소 준비됨",
};

/**
 * A3 (`__DEV__`-only, iOS): account-storage readiness, server health
 * (H1/H2, via the existing `ConnectionDiagnostics`), masked Expo push
 * token, and the raw push diagnostic text A1 no longer shows on the regular
 * alarm row. Only mounted from `account-screen.ios.tsx` when `__DEV__` is
 * true, so `ConnectionDiagnostics`'s H1/H2 calls only fire then (per A3).
 * `ConnectionDiagnostics` is an RN component (unchanged), bridged in via
 * `RNHostView` (DESIGN.md §4 interop).
 */
export function DeveloperSection() {
  const account = useAccountScope();
  const { expoToken, state } = usePushLifecycle();
  const storageStatus = account.state?.status ?? "opening";

  return (
    <Section title="개발자">
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
      <ListItem testID="dev-connection-row">
        <RNHostView>
          <ConnectionDiagnostics />
        </RNHostView>
      </ListItem>
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
    </Section>
  );
}
