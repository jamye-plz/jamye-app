import type { Topic, TopicTag } from "@/core/contracts/server";

import type { TopicPatchInput, TopicTagInput } from "../model/topics-input";

export type TopicEditFormRef = Readonly<{
  /** Reads the current draft and (if it is a valid, changed patch/tag set)
   * calls the `onSave` prop. No-ops on an unchanged or invalid draft. */
  submit: () => void;
}>;

export type TopicEditFormSaveInput = Readonly<{
  /** `null` when the title/body did not change (or the caller cannot edit them). */
  patch: TopicPatchInput | null;
  /** `null` when the tag set did not change (or the caller cannot manage tags). */
  tags: readonly TopicTagInput[] | null;
}>;

export type TopicEditFormProps = Readonly<{
  topic: Topic;
  tags: readonly TopicTag[];
  /** Author-only (`topics-input.ts`'s `topicPermissions`). */
  canEditBody: boolean;
  /** Author or live group owner. */
  canEditTags: boolean;
  busy: boolean;
  errorText?: string;
  onCancel: () => void;
  onSave: (input: TopicEditFormSaveInput) => void;
  /** Fires whenever the draft's dirty+valid state changes, so the caller's
   * native toolbar Save button can enable/disable reactively. */
  onValidityChange: (canSave: boolean) => void;
  testID?: string;
}>;
