import { Stack } from "expo-router";
import { useState } from "react";

import { AppScreen } from "@/shared/ui/app-screen";
import { AppText } from "@/shared/ui/app-text";
import { FormField } from "@/shared/ui/form-field";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import { isTopicTitle } from "../model/topics-input";
import type { TopicsStore } from "../model/topics-store";
import { TopicError } from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";

export function TopicCreateScreen({ groupId }: Readonly<{ groupId: string }>) {
  const screen = useTopicScreen(groupId);
  return (
    <>
      <Stack.Screen options={{ presentation: "modal", title: "새 주제" }} />
      <AppScreen>
        {screen.valid && screen.ready && screen.scoped && screen.store ? (
          <CreateForm
            onCreated={(topicId) => {
              if (screen.current())
                screen.router.replace({
                  pathname: "/groups/[groupId]/topics/[topicId]",
                  params: { groupId, topicId },
                });
            }}
            store={screen.store}
          />
        ) : (
          <AppText>
            {screen.state.accessLost
              ? "그룹에 접근할 수 없습니다."
              : "주제 만들기를 준비하고 있습니다."}
          </AppText>
        )}
      </AppScreen>
    </>
  );
}

function CreateForm({
  onCreated,
  store,
}: Readonly<{ onCreated: (id: string) => void; store: TopicsStore }>) {
  const [title, setTitle] = useState(() => store.getCreateTitle());
  const mutation = store.getState().mutation;
  const busy = mutation.status === "pending";
  const locked =
    mutation.status === "uncertain" || mutation.error === "conflict";
  return (
    <>
      <FormField
        editable={!busy && !locked}
        helper="제목으로 주제를 만들고, 자세한 이야기는 만든 뒤 추가합니다."
        label="주제 제목"
        onChangeText={setTitle}
        value={title}
      />
      <TopicError error={mutation.error} />
      {locked ? (
        <InlineMessage
          kind="error"
          message="생성 결과가 불확실합니다. 먼저 같은 제목으로 재시도하세요. 새 시도는 이전 주제가 이미 생성됐는지 확인한 뒤 선택하세요."
        />
      ) : null}
      <NativeButton
        busy={busy}
        disabled={!isTopicTitle(title)}
        label={locked ? "같은 주제 생성 재시도" : "주제 만들기"}
        onPress={() =>
          void store.actions.create(title).then((topic) => {
            if (topic) onCreated(topic.id);
          })
        }
      />
      {locked ? (
        <NativeButton
          label="이전 결과 확인 후 새 시도"
          onPress={() => {
            store.actions.resetCreate();
            setTitle("");
          }}
          variant="outlined"
        />
      ) : null}
    </>
  );
}
