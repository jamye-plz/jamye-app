import { Host } from "@expo/ui";
import {
  Column,
  FlowRow,
  Icon,
  IconButton,
  InputChip,
  OutlinedTextField,
  Row,
  Text,
  TextButton,
  useNativeState,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxWidth,
  paddingAll,
  weight,
} from "@expo/ui/jetpack-compose/modifiers";
import { forwardRef, useImperativeHandle } from "react";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import { useTopicEditDraft } from "./topic-edit-form.shared";
import type {
  TopicEditFormProps,
  TopicEditFormRef,
} from "./topic-edit-form.types";

export type * from "./topic-edit-form.types";

const CLOSE_ICON =
  require("../../../../assets/icons/material/close.xml") as ImageSourcePropType;

/**
 * Android integrated edit screen body (D2), Material 3 form layout:
 * labelled `OutlinedTextField`s for the title and a multi-line body
 * (prefilled via `useNativeState`), then a 태그 section with a `FlowRow` of
 * `InputChip`s (trailing ✕ removes the tag) and a new-tag field whose
 * 추가 button or keyboard Done adds the tag. Mounted only while
 * `TopicDetailScreen` is in edit mode. iOS resolves to
 * `topic-edit-form.ios.tsx`.
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
    const { colorScheme } = useAppThemeOrSystem();
    const hex = androidThemeColors(colorScheme);
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
    const canAddTag = !busy && draft.newTag.trim().length > 0;
    useImperativeHandle(ref, () => ({
      submit: () => {
        const input = draft.buildSaveInput();
        if (input) onSave(input);
      },
    }));
    return (
      <Host
        seedColor={hex.primary}
        style={{ flex: 1 }}
        testID={testID}
        useViewportSizeMeasurement
      >
        <Column
          modifiers={[fillMaxWidth(), paddingAll(16)]}
          verticalArrangement={{ spacedBy: 16 }}
        >
          {canEditBody ? (
            <>
              <OutlinedTextField
                enabled={!busy}
                keyboardOptions={{ imeAction: "next" }}
                modifiers={[fillMaxWidth()]}
                onValueChange={draft.setTitle}
                singleLine
                value={titleState}
              >
                <OutlinedTextField.Label>
                  <Text>제목</Text>
                </OutlinedTextField.Label>
              </OutlinedTextField>
              <OutlinedTextField
                enabled={!busy}
                minLines={4}
                modifiers={[fillMaxWidth()]}
                onValueChange={draft.setBody}
                value={bodyState}
              >
                <OutlinedTextField.Label>
                  <Text>본문</Text>
                </OutlinedTextField.Label>
              </OutlinedTextField>
            </>
          ) : null}
          {canEditTags ? (
            <Column
              modifiers={[fillMaxWidth()]}
              verticalArrangement={{ spacedBy: 8 }}
            >
              <Text color={hex.textMuted} style={{ typography: "titleSmall" }}>
                태그
              </Text>
              {draft.tagsDraft.length > 0 ? (
                <FlowRow horizontalArrangement={{ spacedBy: 8 }}>
                  {draft.tagsDraft.map((tag) => (
                    <InputChip key={tag.tag}>
                      <InputChip.Label>
                        <Text color={hex.text}>{`#${tag.tag}`}</Text>
                      </InputChip.Label>
                      <InputChip.TrailingIcon>
                        <IconButton
                          enabled={!busy}
                          onClick={() => draft.removeTag(tag.tag)}
                        >
                          <Icon
                            contentDescription={`${tag.tag} 태그 제거`}
                            size={16}
                            source={CLOSE_ICON}
                            tint={hex.textMuted}
                          />
                        </IconButton>
                      </InputChip.TrailingIcon>
                    </InputChip>
                  ))}
                </FlowRow>
              ) : null}
              <Row
                horizontalArrangement={{ spacedBy: 8 }}
                modifiers={[fillMaxWidth()]}
                verticalAlignment="center"
              >
                <OutlinedTextField
                  enabled={!busy}
                  keyboardActions={{ onDone: addTag }}
                  keyboardOptions={{ imeAction: "done" }}
                  maxLength={64}
                  modifiers={[weight(1)]}
                  onValueChange={draft.setNewTag}
                  singleLine
                  value={newTagState}
                >
                  <OutlinedTextField.Label>
                    <Text>새 태그</Text>
                  </OutlinedTextField.Label>
                </OutlinedTextField>
                <TextButton enabled={canAddTag} onClick={addTag}>
                  <Text
                    color={canAddTag ? hex.primary : hex.textMuted}
                    style={{ typography: "labelLarge" }}
                  >
                    추가
                  </Text>
                </TextButton>
              </Row>
            </Column>
          ) : null}
          {errorText ? (
            <Text color={hex.error} style={{ typography: "bodyMedium" }}>
              {errorText}
            </Text>
          ) : null}
        </Column>
      </Host>
    );
  },
);
