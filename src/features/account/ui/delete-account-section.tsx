import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { InlineMessage } from "@/shared/ui/inline-message";

import type { AccountLifecycle } from "../model/account-lifecycle";

const CONFIRM_TITLE = "계정 삭제";
const CONFIRM_MESSAGE = "정말 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.";
const BLOCKED_MESSAGE = "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.";
const ERROR_MESSAGE = "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
// Mirrors NativeButton's busy label so the pending state is visible, not
// only announced through accessibilityState.busy.
const BUSY_TITLE = `${CONFIRM_TITLE} 처리 중…`;

type DeleteAccountSectionProps = Readonly<{
  accountLifecycle: AccountLifecycle;
}>;

export function DeleteAccountSection({
  accountLifecycle,
}: DeleteAccountSectionProps) {
  const { colors } = useAppThemeOrSystem();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Guards against a second confirm firing while the first delete is still
  // in flight (mirrors group-detail-screen.tsx's `confirm()` lifetime guard).
  const pendingRef = useRef(false);
  // A successful delete logs out synchronously, which unmounts this section
  // before its own settle callback runs; skip state updates once unmounted.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function settle(next: string | null): void {
    pendingRef.current = false;
    if (!mountedRef.current) return;
    setPending(false);
    setMessage(next);
  }

  function runDelete(): void {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    void accountLifecycle
      .deleteAccount()
      .then((result) => {
        if (result.status === "blocked") {
          settle(BLOCKED_MESSAGE);
          return;
        }
        if (result.status === "error") {
          settle(ERROR_MESSAGE);
          return;
        }
        // status === "ok": session.logout() already fired inside the
        // lifecycle and navigates the app to the signed-out shell -- no
        // further action needed here.
        settle(null);
      })
      .catch(() => {
        // The lifecycle resolves to a result object by contract; if that
        // contract is ever broken the row must still leave the busy state.
        settle(ERROR_MESSAGE);
      });
  }

  function handlePress(): void {
    if (pendingRef.current) return;
    Alert.alert(CONFIRM_TITLE, CONFIRM_MESSAGE, [
      { style: "cancel", text: "취소" },
      { onPress: runDelete, style: "destructive", text: "삭제" },
    ]);
  }

  return (
    <GroupedSection title="계정">
      <GroupedRow
        accessibilityLabel={CONFIRM_TITLE}
        busy={pending}
        chevron={false}
        destructive
        disabled={pending}
        leading={<AppSymbol name="delete" tintColor={colors.error} />}
        onPress={handlePress}
        title={pending ? BUSY_TITLE : CONFIRM_TITLE}
      />
      {message ? <InlineMessage kind="error" message={message} /> : null}
    </GroupedSection>
  );
}
