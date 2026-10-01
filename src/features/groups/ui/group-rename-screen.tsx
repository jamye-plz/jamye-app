import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { NativeInputDialog } from "@/shared/ui/native-input-dialog";
import { NativeInputSheet } from "@/shared/ui/native-input-sheet";

import { isGroupName } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";

/**
 * I3 group rename on iOS (M17/U11): the C3 one-line input shell, i.e. the
 * same modal `Form` sheet as 새 주제, so 저장 is the sheet's prominent done
 * button. The iOS group info screen presents it (`presentRename`) and hands
 * over its open detail, which `renameGroup` acts on. Android keeps its
 * in-screen `AlertDialog` (`group-rename-dialog.android.tsx`); the
 * `NativeInputDialog` branch only serves a direct visit to the route. The
 * field is seeded once with the name the sheet opened with, so a reload of
 * the detail (e.g. on returning from background) never overwrites what the
 * user is typing. Only this sheet's own attempt surfaces a management error;
 * an earlier failure elsewhere on the info screen stays there.
 */
export function GroupRenameScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { state, actions } = useGroupsStore();
  const router = useRouter();
  const group = state.detail.id === groupId ? state.detail.group : null;
  const [initialName] = useState(group?.name ?? "");
  const [input, setInput] = useState(initialName);
  const [attempted, setAttempted] = useState(false);
  const focused = useRef<symbol | null>(null);
  useFocusEffect(
    useCallback(() => {
      focused.current = Symbol();
      return () => {
        focused.current = null;
      };
    }, []),
  );
  const management = state.management;

  async function submit(): Promise<void> {
    const started = focused.current;
    setAttempted(true);
    const ok = await actions.renameGroup(input);
    // A sheet swiped away mid-request must not pop the info screen below.
    if (ok && started && focused.current === started) router.back();
  }

  const errorText = !attempted
    ? undefined
    : management.status === "failed"
      ? groupErrorMessage(management.error)
      : management.status === "uncertain"
        ? "서버에 반영됐을 수 있습니다. 자동으로 다시 실행하지 않습니다. 새로고침 후 현재 상태를 확인하세요."
        : undefined;
  const shellProps = {
    autoFocus: true,
    busy: management.status === "pending",
    errorText,
    helperText: "이름은 1~128자입니다. 입력한 공백도 그대로 사용합니다.",
    initialValue: initialName,
    onCancel: () => router.back(),
    onChangeValue: (next: string) => {
      setInput(next);
      setAttempted(false);
    },
    onSubmit: () => void submit(),
    placeholder: "그룹 이름",
    submitDisabled:
      !group ||
      state.detail.status !== "ready" ||
      !isGroupName(input) ||
      input === group.name,
    submitLabel: "저장",
    testID: "group-rename-screen",
    title: "그룹 이름 변경",
    value: input,
  };
  return process.env.EXPO_OS === "ios" ? (
    <NativeInputSheet {...shellProps} />
  ) : (
    <NativeInputDialog {...shellProps} />
  );
}
