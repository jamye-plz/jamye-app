import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, StyleSheet } from "react-native";
import { isValidInviteJoinCode } from "@/core/contracts/server";
import { AppScreen } from "@/shared/ui/app-screen";
import { FormField } from "@/shared/ui/form-field";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import { isGroupName } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { GroupError } from "./group-controls";

export function GroupFormScreen({
  mode,
}: Readonly<{ mode: "create" | "join" }>) {
  const [input, setInput] = useState("");
  const focused = useRef<symbol | null>(null);
  const { state, actions } = useGroupsStore();
  const router = useRouter();
  const creating = mode === "create";
  const mutation = creating ? state.createGroup : state.joinByInvite;
  const valid = creating ? isGroupName(input) : isValidInviteJoinCode(input);
  useFocusEffect(
    useCallback(() => {
      focused.current = Symbol();
      if (mode === "create") actions.resetCreateGroup();
      else actions.resetJoinByInvite();
      return () => {
        focused.current = null;
        if (mode === "join") actions.resetJoinByInvite();
      };
    }, [actions, mode]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && mode === "join") setInput("");
    });
    return () => subscription.remove();
  }, [mode]);
  async function submit(confirmedRepeat = false): Promise<void> {
    if (!valid) return;
    const started = focused.current;
    const result = creating
      ? await actions.createGroup(input, confirmedRepeat)
      : await actions.joinByInvite(input);
    if (result && started && focused.current === started) {
      const groupId = "id" in result ? result.id : result.groupId;
      setInput("");
      router.replace({ pathname: "/groups/[groupId]", params: { groupId } });
    }
  }
  const unknown = mutation.status === "uncertain";
  return (
    <>
      <Stack.Screen
        options={{
          presentation: "modal",
          title: creating ? "새 그룹" : "초대 코드로 가입",
        }}
      />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <AppScreen keyboardShouldPersistTaps="handled">
          <FormField
            label={creating ? "그룹 이름" : "초대 코드"}
            value={input}
            onChangeText={setInput}
            editable={mutation.status !== "pending"}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            helper={
              creating
                ? "이름은 1~128자입니다. 입력한 공백도 그대로 사용합니다."
                : "16~64자의 영문, 숫자, 밑줄, 하이픈으로 된 코드를 입력하세요."
            }
          />
          {mutation.status === "failed" && (
            <GroupError error={mutation.error} />
          )}
          {unknown && (
            <InlineMessage
              kind="error"
              message="서버 응답을 확인하지 못했지만 그룹이 이미 만들어졌을 수 있습니다. 목록 조회만으로 생성 여부를 확정할 수 없습니다. 다시 만들면 중복될 수 있습니다."
            />
          )}
          <NativeButton
            label={creating ? "만들기" : "가입하기"}
            busy={mutation.status === "pending"}
            retryAt={creating ? state.retryAt.create : state.retryAt.join}
            disabled={!valid || unknown}
            onPress={() => void submit()}
          />
          {unknown && (
            <NativeButton
              variant="outlined"
              label="중복 생성 가능성을 이해하고 다시 만들기"
              retryAt={state.retryAt.create}
              disabled={!valid}
              onPress={() => void submit(true)}
            />
          )}
        </AppScreen>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
