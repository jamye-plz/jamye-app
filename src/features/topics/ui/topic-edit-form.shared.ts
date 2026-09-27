import { useEffect, useMemo, useState } from "react";

import type { Topic, TopicTag } from "@/core/contracts/server";

import {
  isTopicPatch,
  isTopicTags,
  normalizeTopicPatch,
  type TopicPatchInput,
  type TopicTagInput,
} from "../model/topics-input";
import type { TopicEditFormSaveInput } from "./topic-edit-form.types";

function tagSetKey(
  tags: readonly Pick<TopicTagInput, "tag" | "source" | "confidence">[],
): string {
  return JSON.stringify(
    [...tags]
      .map((tag) => [tag.tag, tag.source, tag.confidence ?? null] as const)
      .sort(),
  );
}

/**
 * Draft state shared by the iOS Form-sheet and Android full-screen-dialog
 * variants of D2's integrated edit screen: title/body/tags start prefilled
 * from the loaded topic (the caller mounts this fresh -- `key={topic.id}` --
 * so the initial values are never stale), track edits in plain React state
 * for the native toolbar's reactive Save-button `disabled` state, and only
 * report a patch/tag list back to the caller for what actually changed.
 */
export function useTopicEditDraft(
  topic: Topic,
  tags: readonly TopicTag[],
  canEditBody: boolean,
  canEditTags: boolean,
  onValidityChange: (canSave: boolean) => void,
) {
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body ?? "");
  const [tagsDraft, setTagsDraft] = useState<readonly TopicTagInput[]>(() =>
    tags.map(({ tag, source, confidence }) => ({ tag, source, confidence })),
  );
  const [newTag, setNewTag] = useState("");

  const patch: TopicPatchInput = {
    ...(canEditBody && title !== topic.title ? { title } : {}),
    ...(canEditBody && body !== (topic.body ?? "") ? { body } : {}),
  };
  const titleOrBodyChanged = Object.keys(patch).length > 0;
  const bodyValid = !titleOrBodyChanged || isTopicPatch(patch);

  // Text typed into the new-tag field but not yet added still counts: Save
  // includes it rather than staying disabled until 추가 is pressed. A tag
  // that is already in the set is ignored instead of duplicated.
  const pendingTag = newTag.trim();
  const pendingIsNew =
    pendingTag.length > 0 && !tagsDraft.some((item) => item.tag === pendingTag);
  const effectiveTags: readonly TopicTagInput[] = pendingIsNew
    ? [...tagsDraft, { confidence: null, source: "user", tag: pendingTag }]
    : tagsDraft;

  const originalTagKey = useMemo(() => tagSetKey(tags), [tags]);
  const tagsChanged =
    canEditTags && originalTagKey !== tagSetKey(effectiveTags);
  const tagsValid = !tagsChanged || isTopicTags(effectiveTags);

  const canSave = (titleOrBodyChanged || tagsChanged) && bodyValid && tagsValid;

  useEffect(() => {
    onValidityChange(canSave);
  }, [canSave, onValidityChange]);

  /** Moves the typed tag into the set. Returns `true` when the input was
   * consumed, so the caller clears its native text field as well. */
  function addTag(): boolean {
    if (!pendingTag) return false;
    setTagsDraft(effectiveTags);
    setNewTag("");
    return true;
  }
  function removeTag(tag: string) {
    setTagsDraft((current) => current.filter((item) => item.tag !== tag));
  }
  function buildSaveInput(): TopicEditFormSaveInput | null {
    if (!canSave) return null;
    return {
      patch: titleOrBodyChanged ? normalizeTopicPatch(patch) : null,
      tags: tagsChanged ? effectiveTags : null,
    };
  }

  return {
    addTag,
    body,
    buildSaveInput,
    canSave,
    newTag,
    removeTag,
    setBody,
    setNewTag,
    setTitle,
    tagsDraft,
    title,
  };
}
