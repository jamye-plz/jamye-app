import { BottomSheet, Host } from "@expo/ui";
import { useState } from "react";
import { Share, View } from "react-native";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { FormField } from "@/shared/ui/form-field";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import { isInviteInput } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";

export function GroupOwnerPanel({
  isPresented,
  onDismiss,
}: Readonly<{ isPresented: boolean; onDismiss: () => void }>) {
  const { state, actions } = useGroupsStore();
  const { colors } = useAppTheme();
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [shareFailed, setShareFailed] = useState(false);
  const busy = state.management.status === "pending";
  const input = {
    expiresAt: expiresAt === "" ? null : expiresAt,
    maxUses:
      maxUses === "" ? null : /^[0-9]+$/.test(maxUses) ? Number(maxUses) : NaN,
  };
  const validInvite = isInviteInput(input);

  async function shareCode(): Promise<void> {
    if (!state.invite) return;
    setShareFailed(false);
    try {
      await Share.share({ message: state.invite.code });
    } catch {
      setShareFailed(true);
    }
  }

  return (
    <Host>
      <BottomSheet
        isPresented={isPresented}
        onDismiss={onDismiss}
        snapPoints={["half", "full"]}
      >
        <View style={styles.content}>
          <AppText variant="headline" color={colors.text}>
            멤버 초대
          </AppText>
          <FormField
            label="만료 시각 (선택, ISO 8601)"
            placeholder="예: 2030-01-01T12:00:00+09:00"
            value={expiresAt}
            onChangeText={setExpiresAt}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <FormField
            label="최대 사용 횟수 (선택)"
            value={maxUses}
            onChangeText={setMaxUses}
            keyboardType="number-pad"
            editable={!busy}
          />
          <AppText variant="footnote" color={colors.textMuted}>
            비워 두면 제한이 없습니다. 만료 시각은 미래, 사용 횟수는 1
            이상이어야 합니다.
          </AppText>
          <NativeButton
            label="초대 코드 발급"
            retryAt={state.retryAt.management}
            busy={busy}
            disabled={!validInvite || state.inviteUncertain}
            onPress={() => void actions.createInvite(input)}
            testID="group-owner-panel-issue"
          />
          {state.inviteUncertain && (
            <>
              <InlineMessage
                kind="error"
                message="발급 결과를 확인하지 못했습니다. 기존 코드가 이미 발급됐을 수 있으며, 분실한 코드는 조회할 수 없습니다. 다시 발급하면 별도 코드가 추가됩니다."
              />
              <NativeButton
                variant="outlined"
                label="추가 발급 가능성을 이해하고 다시 발급"
                retryAt={state.retryAt.management}
                disabled={!validInvite}
                busy={busy}
                onPress={() => void actions.createInvite(input, true)}
              />
            </>
          )}
          {state.invite && (
            <>
              <AppText selectable variant="title" color={colors.text}>
                {state.invite.code}
              </AppText>
              <AppText variant="footnote" color={colors.textMuted}>
                코드는 이 화면에서만 표시됩니다. 가입시킬 사람에게만 공유하세요.
              </AppText>
              <NativeButton
                variant="text"
                label="초대 코드 공유"
                onPress={() => void shareCode()}
              />
              <NativeButton
                variant="text"
                label="초대 코드 숨기기"
                onPress={actions.clearInvite}
              />
            </>
          )}
          {shareFailed && (
            <InlineMessage
              kind="error"
              message="공유를 열지 못했습니다. 코드 텍스트를 선택해 복사할 수 있습니다."
            />
          )}
        </View>
      </BottomSheet>
    </Host>
  );
}

const styles = {
  content: {
    gap: appSpacing.md,
    padding: appSpacing.md,
  },
} as const;
