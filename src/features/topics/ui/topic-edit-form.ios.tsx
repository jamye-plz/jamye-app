import {
  Button,
  Form,
  Host,
  HStack,
  Section,
  SwipeActions,
  Text,
  TextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import { forwardRef, useImperativeHandle } from "react";

import { useTopicEditDraft } from "./topic-edit-form.shared";
import type {
  TopicEditFormProps,
  TopicEditFormRef,
} from "./topic-edit-form.types";

export type * from "./topic-edit-form.types";

/**
 * iOS integrated edit screen body (D2): a `Form` sheet with title/body
 * `TextField`s (prefilled via `useNativeState`, since the kit's
 * `native-input-sheet.ios.tsx` fields are uncontrolled-only) and a tag list
 * section with per-row swipe-to-delete plus an add row. Mounted only while
 * `TopicDetailScreen` is in edit mode, keyed by `topic.id`, so the native
 * state's initial value is always the freshly loaded topic. Android resolves
 * to `topic-edit-form.android.tsx`.
 */
export const TopicEditForm = forwardRef<TopicEditFormRef, TopicEditFormProps>(
  function TopicEditForm(
    {
      busy,
      canEditBody,
      canEditTags,
      errorText,
      onSave,
      onValidityChange,
      tags,
      testID,
      topic,
    },
    ref,
  ) {
    const draft = useTopicEditDraft(
      topic,
      tags,
      canEditBody,
      canEditTags,
      onValidityChange,
    );
    const titleState = useNativeState(topic.title);
    const bodyState = useNativeState(topic.body ?? "");
    const newTagState = useNativeState("");
    const addTag = () => {
      if (draft.addTag()) newTagState.set("");
    };
    useImperativeHandle(ref, () => ({
      submit: () => {
        const input = draft.buildSaveInput();
        if (input) onSave(input);
      },
    }));
    return (
      <Host style={{ flex: 1 }} testID={testID} useViewportSizeMeasurement>
        <Form>
          {canEditBody ? (
            <Section
              footer={errorText ? <Text>{errorText}</Text> : undefined}
              title="제목·본문"
            >
              <TextField
                modifiers={busy ? [disabled(true)] : undefined}
                onTextChange={draft.setTitle}
                placeholder="주제 제목"
                text={titleState}
              />
              <TextField
                axis="vertical"
                modifiers={busy ? [disabled(true)] : undefined}
                onTextChange={draft.setBody}
                placeholder="주제 본문"
                text={bodyState}
              />
            </Section>
          ) : null}
          {canEditTags ? (
            <Section title="태그">
              {draft.tagsDraft.map((tag) => (
                <SwipeActions key={tag.tag}>
                  <HStack>
                    <Text>{`#${tag.tag}`}</Text>
                  </HStack>
                  <SwipeActions.Actions allowsFullSwipe={false} edge="trailing">
                    <Button
                      label="삭제"
                      modifiers={busy ? [disabled(true)] : undefined}
                      onPress={() => draft.removeTag(tag.tag)}
                      role="destructive"
                    />
                  </SwipeActions.Actions>
                </SwipeActions>
              ))}
              <HStack spacing={8}>
                <TextField
                  modifiers={busy ? [disabled(true)] : undefined}
                  onTextChange={draft.setNewTag}
                  placeholder="새 태그"
                  text={newTagState}
                />
                <Button
                  label="추가"
                  modifiers={
                    busy || !draft.newTag.trim() ? [disabled(true)] : undefined
                  }
                  onPress={addTag}
                />
              </HStack>
              {!canEditBody && errorText ? <Text>{errorText}</Text> : null}
            </Section>
          ) : null}
        </Form>
      </Host>
    );
  },
);
