import { fireEvent, render } from "@testing-library/react-native";
import { createRef } from "react";
import type { ReactNode } from "react";

import type { Topic, TopicTag } from "@/core/contracts/server";
import { TopicEditForm } from "@/features/topics/ui/topic-edit-form.ios";
import type { TopicEditFormRef } from "@/features/topics/ui/topic-edit-form.types";

type ModifierRecord = Readonly<{ $type: string; value?: unknown }>;

jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    TextInput,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  const isDisabled = (modifiers: readonly ModifierRecord[] | undefined) =>
    Boolean(modifiers?.some((m) => m.$type === "disabled" && m.value));
  function Host({
    children,
    testID,
  }: Readonly<{ children?: ReactNode; testID?: string }>) {
    return <View testID={testID}>{children}</View>;
  }
  function Form({ children }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  function Section({
    children,
    footer,
  }: Readonly<{ children?: ReactNode; footer?: ReactNode }>) {
    return (
      <View>
        {children}
        {footer}
      </View>
    );
  }
  function HStack({ children }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  function Text({ children }: Readonly<{ children?: ReactNode }>) {
    return <RNText>{children}</RNText>;
  }
  function TextField({
    axis,
    modifiers,
    onTextChange,
    placeholder,
    text,
  }: Readonly<{
    axis?: string;
    modifiers?: readonly ModifierRecord[];
    onTextChange?: (value: string) => void;
    placeholder?: string;
    text?: { value: string; set: (value: string) => void };
  }>) {
    return (
      <TextInput
        accessibilityLabel={placeholder}
        editable={!isDisabled(modifiers)}
        multiline={axis === "vertical"}
        onChangeText={(value) => {
          // Typing writes the native state and fires onTextChange.
          text?.set(value);
          onTextChange?.(value);
        }}
        value={text?.value}
      />
    );
  }
  function Button({
    label,
    modifiers,
    onPress,
  }: Readonly<{
    label?: string;
    modifiers?: readonly ModifierRecord[];
    onPress?: () => void;
  }>) {
    const disabled = isDisabled(modifiers);
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onPress}
      >
        <RNText>{label}</RNText>
      </Pressable>
    );
  }
  function SwipeActions({ children }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  }
  SwipeActions.Actions = function Actions({
    children,
  }: Readonly<{ children?: ReactNode }>) {
    return <View>{children}</View>;
  };
  function useNativeState<T>(initial: T): {
    value: T;
    set: (value: T) => void;
  } {
    const { useState } = jest.requireActual<typeof import("react")>("react");
    const [value, set] = useState(initial);
    return { set, value };
  }
  return {
    Button,
    Form,
    HStack,
    Host,
    Section,
    SwipeActions,
    Text,
    TextField,
    useNativeState,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  disabled: (value: boolean) => ({ $type: "disabled", value }),
}));

const topic: Topic = {
  authorAvatarUrl: null,
  authorId: "22222222-2222-4222-8222-222222222222",
  authorNickname: "작성자",
  body: "원래 본문",
  chatroomId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-22T00:00:00Z",
  groupId: "11111111-1111-4111-8111-111111111111",
  id: "44444444-4444-4444-8444-444444444444",
  status: "seed",
  tags: [],
  title: "원래 제목",
  unread: false,
  updatedAt: "2026-09-22T00:00:00Z",
};
const tags: readonly TopicTag[] = [
  {
    confidence: null,
    id: "55555555-5555-4555-8555-555555555555",
    source: "user",
    tag: "여행",
    topicId: topic.id,
  },
];

describe("TopicEditForm (iOS)", () => {
  test("prefills title/body, edits only the title and reports a title-only patch on submit", async () => {
    const onSave = jest.fn();
    const onValidityChange = jest.fn();
    const ref = createRef<TopicEditFormRef>();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody
        canEditTags={false}
        onCancel={jest.fn()}
        onSave={onSave}
        onValidityChange={onValidityChange}
        ref={ref}
        tags={[]}
        topic={topic}
      />,
    );
    expect(screen.getByLabelText("주제 제목").props.value).toBe("원래 제목");
    expect(screen.getByLabelText("주제 본문").props.value).toBe("원래 본문");
    await fireEvent.changeText(screen.getByLabelText("주제 제목"), "새 제목");
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: { title: "새 제목" },
      tags: null,
    });
  });

  test("clearing the body makes the draft invalid, so submit is a no-op", async () => {
    const onSave = jest.fn();
    const onValidityChange = jest.fn();
    const ref = createRef<TopicEditFormRef>();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody
        canEditTags={false}
        onCancel={jest.fn()}
        onSave={onSave}
        onValidityChange={onValidityChange}
        ref={ref}
        tags={[]}
        topic={topic}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("주제 본문"), "");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    ref.current!.submit();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("tags: swipe-delete removes the existing tag, add stages a new one, and only the tag set reports on submit", async () => {
    const onSave = jest.fn();
    const ref = createRef<TopicEditFormRef>();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody={false}
        canEditTags
        onCancel={jest.fn()}
        onSave={onSave}
        onValidityChange={jest.fn()}
        ref={ref}
        tags={tags}
        topic={topic}
      />,
    );
    expect(screen.queryByLabelText("주제 제목")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "삭제" }));
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "새태그");
    await fireEvent.press(screen.getByRole("button", { name: "추가" }));
    // The native field is cleared too, not only the React draft.
    expect(screen.getByLabelText("새 태그").props.value).toBe("");
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: null,
      tags: [{ confidence: null, source: "user", tag: "새태그" }],
    });
  });

  test("a typed tag that was not added yet is saved together with the title change", async () => {
    const onSave = jest.fn();
    const onValidityChange = jest.fn();
    const ref = createRef<TopicEditFormRef>();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody
        canEditTags
        onCancel={jest.fn()}
        onSave={onSave}
        onValidityChange={onValidityChange}
        ref={ref}
        tags={[]}
        topic={topic}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("주제 제목"), "새 제목");
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "미확정");
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: { title: "새 제목" },
      tags: [{ confidence: null, source: "user", tag: "미확정" }],
    });
  });
});
