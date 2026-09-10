import { useState } from "react";
import {
  TopicText as AppText,
  TopicButton,
  TopicError,
  TopicField,
  TopicLayout,
} from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";
import { isTopicTitle } from "../model/topics-input";
import type { TopicsStore } from "../model/topics-store";

export function TopicCreateScreen({ groupId }: Readonly<{ groupId: string }>) {
  const screen = useTopicScreen(groupId);
  return (
    <TopicLayout>
      <TopicButton
        secondary
        label="주제 목록으로"
        onPress={screen.backToTopics}
      />
      <AppText variant="title" accessibilityRole="header">
        새 주제
      </AppText>
      {screen.valid && screen.ready && screen.scoped && screen.store ? (
        <CreateForm
          store={screen.store}
          onCreated={(topicId) => {
            if (screen.current())
              screen.router.replace({
                pathname: "/groups/[groupId]/topics/[topicId]",
                params: { groupId, topicId },
              });
          }}
        />
      ) : (
        <AppText>
          {screen.state.accessLost
            ? "그룹에 접근할 수 없습니다."
            : "주제 만들기를 준비하고 있습니다."}
        </AppText>
      )}
    </TopicLayout>
  );
}
function CreateForm({
  store,
  onCreated,
}: Readonly<{ store: TopicsStore; onCreated: (id: string) => void }>) {
  const [title, setTitle] = useState(() => store.getCreateTitle());
  const mutation = store.getState().mutation;
  const busy = mutation.status === "pending";
  const locked =
    mutation.status === "uncertain" || mutation.error === "conflict";
  return (
    <>
      <AppText>
        제목으로 주제를 만들고, 자세한 이야기는 만든 뒤 추가합니다.
      </AppText>
      <TopicField
        label="주제 제목"
        value={title}
        onChangeText={setTitle}
        editable={!busy && !locked}
      />
      <TopicError error={mutation.error} />
      {locked ? (
        <AppText>
          생성 결과가 불확실합니다. 먼저 같은 제목으로 재시도하세요. 새 시도는
          이전 주제가 이미 생성됐는지 확인한 뒤 선택하세요.
        </AppText>
      ) : null}
      <TopicButton
        label={locked ? "같은 주제 생성 재시도" : "주제 만들기"}
        busy={busy}
        disabled={!isTopicTitle(title)}
        onPress={() =>
          void store.actions.create(title).then((topic) => {
            if (topic) onCreated(topic.id);
          })
        }
      />
      {locked ? (
        <TopicButton
          secondary
          label="이전 결과 확인 후 새 시도"
          onPress={() => {
            store.actions.resetCreate();
            setTitle("");
          }}
        />
      ) : null}
    </>
  );
}
