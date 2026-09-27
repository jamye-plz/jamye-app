import { Stack } from "expo-router";
import { useState } from "react";

import { NativeInputDialog } from "@/shared/ui/native-input-dialog";
import { NativeInputSheet } from "@/shared/ui/native-input-sheet";

import { isTopicTitle } from "../model/topics-input";
import { TOPICS_ERROR_MESSAGES } from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";

const HELPER_TEXT =
  "제목으로 주제를 만들고, 자세한 이야기는 만든 뒤 추가합니다.";
const LOCKED_TEXT =
  "생성 결과가 불확실합니다. 같은 제목으로 재시도하면 이미 만들어진 주제를 중복 없이 확인합니다. 제목을 바꿔 만들면 새 주제로 시도하니 이전 주제가 만들어졌는지 먼저 확인하세요.";

/**
 * New topic (T7) on the kit's one-line input shell (C3): iOS
 * `NativeInputSheet` (modal `Form` sheet), Android `NativeInputDialog` (M3
 * full-screen dialog). Creation replaces this screen with the new topic's own
 * chatroom -- `create` already returns `Topic.chatroomId`, so no extra lookup
 * is needed.
 *
 * A create whose outcome is unknown keeps its title and idempotency key in
 * the store. The shell has a single action, so it carries both ways out: with
 * the kept title it is 재시도 (same key, so the server hands back the topic if
 * the first attempt landed); with an edited title it is an explicit new
 * attempt (reset, then create under a new key).
 */
export function TopicCreateScreen({ groupId }: Readonly<{ groupId: string }>) {
  const screen = useTopicScreen(groupId);
  const store =
    screen.valid && screen.ready && screen.scoped ? screen.store : null;
  const [input, setInput] = useState("");
  const [prefill, setPrefill] = useState<string | undefined>(undefined);
  // Seed once per store with a title kept by an earlier uncertain attempt
  // (a render-phase update, so the field never shows empty first).
  const [seededFrom, setSeededFrom] = useState<typeof store>(null);
  if (store !== seededFrom) {
    setSeededFrom(store);
    const kept = store?.getCreateTitle();
    if (kept) {
      setInput(kept);
      setPrefill(kept);
    }
  }

  const mutation = screen.state.mutation;
  const locked =
    mutation.status === "uncertain" || mutation.error === "conflict";
  const retrying = locked && input.trim() === (store?.getCreateTitle() ?? "");

  async function submit(): Promise<void> {
    if (!store || !isTopicTitle(input)) return;
    if (locked && !retrying) store.actions.resetCreate();
    const topic = await store.actions.create(input);
    if (topic && screen.current())
      screen.router.replace({
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
        params: { groupId, chatroomId: topic.chatroomId },
      });
  }

  const errorText = screen.state.accessLost
    ? "그룹에 접근할 수 없습니다."
    : locked
      ? LOCKED_TEXT
      : mutation.status === "error" && mutation.error
        ? TOPICS_ERROR_MESSAGES[mutation.error]
        : undefined;
  const shellProps = {
    autoFocus: true,
    busy: mutation.status === "pending",
    errorText,
    helperText: store ? HELPER_TEXT : "주제 만들기를 준비하고 있습니다.",
    initialValue: prefill,
    onCancel: () => screen.router.back(),
    onChangeValue: setInput,
    onSubmit: () => void submit(),
    placeholder: "주제 제목",
    submitDisabled: !store || !isTopicTitle(input),
    submitLabel: retrying ? "재시도" : "만들기",
    testID: "topic-create-screen",
    title: "새 주제",
    value: input,
  };
  return (
    <>
      <Stack.Screen options={{ presentation: "modal" }} />
      {process.env.EXPO_OS === "ios" ? (
        <NativeInputSheet {...shellProps} />
      ) : (
        <NativeInputDialog {...shellProps} />
      )}
    </>
  );
}
