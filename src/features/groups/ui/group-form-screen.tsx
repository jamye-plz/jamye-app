import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isValidInviteJoinCode } from "@/core/contracts/server";
import { NativeInputDialog } from "@/shared/ui/native-input-dialog";
import { NativeInputSheet } from "@/shared/ui/native-input-sheet";
import { isGroupName } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { pendingInviteStore } from "../model/pending-invite-store";
import { groupErrorMessage } from "./group-controls";
import { showGroupHome } from "./show-group-home";

/**
 * One-line input screen (C3): 새 그룹 만들기 / 초대 코드로 가입, on the kit's
 * native input shell -- iOS `NativeInputSheet` (modal `Form` sheet), Android
 * `NativeInputDialog` (M3 full-screen dialog). The uncertain-create repeat
 * flow (server response lost after a create attempt) is adapted to the
 * shell's single submit action: while `mutation.status === "uncertain"`, the
 * same submit button becomes the explicit repeat confirmation (the footer
 * error text spells out the duplicate risk first) instead of a second
 * button, since the shell has room for exactly one.
 */
export function GroupFormScreen({
  mode,
}: Readonly<{ mode: "create" | "join" }>) {
  const [input, setInput] = useState("");
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
  const focused = useRef<symbol | null>(null);
  const { state, actions } = useGroupsStore();
  const router = useRouter();
  const creating = mode === "create";
  const mutation = creating ? state.createGroup : state.joinByInvite;
  const valid = creating ? isGroupName(input) : isValidInviteJoinCode(input);
  const unknown = mutation.status === "uncertain";
  const retryAt = creating ? state.retryAt.create : state.retryAt.join;
  const [clock, setClock] = useState(Date.now);
  const rateLimited = retryAt > clock;
  useEffect(() => {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(remaining, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [retryAt, clock]);
  useFocusEffect(
    useCallback(() => {
      focused.current = Symbol();
      if (mode === "create") {
        actions.resetCreateGroup();
      } else {
        actions.resetJoinByInvite();
        setInput("");
        // Reset first, then prefill (order matters, per A3): a pending
        // invite code from a deep link is consumed once here and never
        // logged or placed in route params/navigation history. The user
        // must still press 가입 -- consuming the code only fills the field.
        const code = pendingInviteStore.consume();
        if (code) {
          setInput(code);
          setPrefill(code);
        }
      }
      return () => {
        focused.current = null;
        if (mode === "join") actions.resetJoinByInvite();
      };
    }, [actions, mode]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && mode === "join") {
        setInput("");
        setPrefill("");
      }
    });
    return () => subscription.remove();
  }, [mode]);

  async function submit(): Promise<void> {
    if (!valid) return;
    const confirmedRepeat = unknown;
    const started = focused.current;
    const result = creating
      ? await actions.createGroup(input, confirmedRepeat)
      : await actions.joinByInvite(input);
    if (result && started && focused.current === started) {
      const groupId = "id" in result ? result.id : result.groupId;
      setInput("");
      showGroupHome(router, groupId);
    }
  }

  const errorText = unknown
    ? "서버 응답을 확인하지 못했지만 그룹이 이미 만들어졌을 수 있습니다. 목록 조회만으로 생성 여부를 확정할 수 없습니다. 다시 누르면 중복 생성될 수 있습니다."
    : mutation.status === "failed"
      ? groupErrorMessage(mutation.error)
      : undefined;
  const shellProps = {
    autoFocus: true,
    busy: mutation.status === "pending",
    errorText,
    helperText: creating
      ? "이름은 1~128자입니다. 입력한 공백도 그대로 사용합니다."
      : "16~64자의 영문, 숫자, 밑줄, 하이픈으로 된 코드를 입력하세요.",
    initialValue: prefill,
    // An invite link, or the post-login redirect with a pending invite, opens
    // the join screen as the only screen in the stack: with nothing to go
    // back to, closing it lands on the group list instead of doing nothing.
    onCancel: () =>
      router.canGoBack() ? router.back() : router.replace("/groups"),
    onChangeValue: setInput,
    onSubmit: () => void submit(),
    placeholder: creating ? "그룹 이름" : "초대 코드",
    submitDisabled: !valid || rateLimited,
    submitLabel: creating ? "만들기" : "가입",
    testID: "group-form-screen",
    title: creating ? "새 그룹" : "초대 코드로 가입",
    value: input,
  };
  return process.env.EXPO_OS === "ios" ? (
    <NativeInputSheet {...shellProps} />
  ) : (
    <NativeInputDialog {...shellProps} />
  );
}
