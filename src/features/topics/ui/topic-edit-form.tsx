import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View } from "react-native";

import { appSpacing } from "@/core/theme/tokens";
import { FormField } from "@/shared/ui/form-field";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import { useTopicEditDraft } from "./topic-edit-form.shared";
import type {
  TopicEditFormProps,
  TopicEditFormRef,
} from "./topic-edit-form.types";

export type * from "./topic-edit-form.types";

/**
 * Fallback for platforms without a native `Form`/`OutlinedTextField`
 * affordance (web): plain `FormField`s and a chip row built from
 * `NativeButton`. iOS resolves to `topic-edit-form.ios.tsx`, Android to
 * `topic-edit-form.android.tsx`.
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
    useImperativeHandle(ref, () => ({
      submit: () => {
        const input = draft.buildSaveInput();
        if (input) onSave(input);
      },
    }));
    return (
      <View style={styles.gap} testID={testID}>
        {canEditBody ? (
          <>
            <FormField
              editable={!busy}
              label="주제 제목"
              onChangeText={draft.setTitle}
              value={draft.title}
            />
            <FormField
              editable={!busy}
              label="주제 본문"
              multiline
              onChangeText={draft.setBody}
              value={draft.body}
            />
          </>
        ) : null}
        {canEditTags ? (
          <View style={styles.gap}>
            <View style={styles.chipRow}>
              {draft.tagsDraft.map((tag) => (
                <NativeButton
                  disabled={busy}
                  key={tag.tag}
                  label={`${tag.tag} ×`}
                  onPress={() => draft.removeTag(tag.tag)}
                  variant="outlined"
                />
              ))}
            </View>
            <FormField
              editable={!busy}
              label="새 태그"
              onChangeText={draft.setNewTag}
              value={draft.newTag}
            />
            <NativeButton
              disabled={busy || !draft.newTag.trim()}
              label="태그 추가"
              onPress={draft.addTag}
              variant="text"
            />
          </View>
        ) : null}
        {errorText ? <InlineMessage kind="error" message={errorText} /> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: appSpacing.xs },
  gap: { gap: appSpacing.sm },
});
