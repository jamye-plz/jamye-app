import { useAccountScope } from "@/core/providers/app-providers";
import { ConnectionDiagnostics } from "@/features/home/ui/connection-diagnostics";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";
import {
  describePushState,
  maskExpoToken,
} from "@/features/notifications/ui/notification-settings-section.shared";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { NativeButton } from "@/shared/ui/native-button";

const STORAGE_STATUS_TEXT: Record<string, string> = {
  error: "로컬 계정 저장소를 열 수 없습니다. 다시 시도해 주세요.",
  opening: "로컬 계정 저장소 준비 중…",
  ready: "로컬 계정 저장소 준비됨",
};

/**
 * Fallback for platforms without a native settings-list affordance (web).
 * iOS resolves to `developer-section.ios.tsx`, Android to
 * `developer-section.android.tsx`.
 */
export function DeveloperSection() {
  const account = useAccountScope();
  const { expoToken, state } = usePushLifecycle();
  const storageStatus = account.state?.status ?? "opening";

  return (
    <GroupedSection title="개발자">
      <GroupedRow
        subtitle={STORAGE_STATUS_TEXT[storageStatus]}
        title="계정 저장소"
        trailing={
          storageStatus === "error" ? (
            <NativeButton
              label="계정 저장소 다시 시도"
              onPress={account.retry}
              variant="text"
            />
          ) : undefined
        }
      />
      <ConnectionDiagnostics />
      <GroupedRow subtitle={maskExpoToken(expoToken)} title="푸시 토큰" />
      <GroupedRow subtitle={describePushState(state)} title="푸시 진단" />
    </GroupedSection>
  );
}
