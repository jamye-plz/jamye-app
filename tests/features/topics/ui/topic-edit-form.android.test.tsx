import { fireEvent, render } from "@testing-library/react-native";
import { createRef } from "react";
import type { ReactNode } from "react";

import type { Topic, TopicTag } from "@/core/contracts/server";
import type { TopicEditFormRef } from "@/features/topics/ui/topic-edit-form.types";

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
      <View testID={testID}>{children}</View>
    ),
  };
});
jest.mock("@expo/ui/jetpack-compose", () => {
  const {
    Pressable,
    Text: RNText,
    TextInput,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  const { Children } = jest.requireActual<typeof import("react")>("react");
  function extractText(node: unknown): string {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (
      node &&
      typeof node === "object" &&
      "props" in node &&
      (node as { props?: { children?: unknown } }).props?.children !== undefined
    )
      return extractText(
        (node as { props: { children: unknown } }).props.children,
      );
    return "";
  }
  function Column({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  function Row({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  function FlowRow({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  function InputChip({ children }: { children?: ReactNode }) {
    return <View>{children}</View>;
  }
  InputChip.Label = function InputChipLabel({
    children,
  }: {
    children?: ReactNode;
  }) {
    return <View>{children}</View>;
  };
  InputChip.TrailingIcon = function InputChipTrailingIcon({
    children,
  }: {
    children?: ReactNode;
  }) {
    return <View>{children}</View>;
  };
  function Text({
    children,
    color,
  }: {
    children?: ReactNode;
    color?: unknown;
  }) {
    return <RNText {...{ color }}>{children}</RNText>;
  }
  function Icon({ contentDescription }: { contentDescription?: string }) {
    return <RNText>{contentDescription}</RNText>;
  }
  function IconButton({
    children,
    enabled,
    onClick,
  }: {
    children?: ReactNode;
    enabled?: boolean;
    onClick?: () => void;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: enabled === false }}
        onPress={onClick}
      >
        {children}
      </Pressable>
    );
  }
  function TextButton({
    children,
    enabled,
    onClick,
  }: {
    children?: ReactNode;
    enabled?: boolean;
    onClick?: () => void;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: enabled === false }}
        onPress={enabled === false ? undefined : onClick}
      >
        {children}
      </Pressable>
    );
  }
  function OutlinedTextField({
    children,
    enabled,
    keyboardActions,
    minLines,
    modifiers,
    onValueChange,
    singleLine,
    value,
  }: {
    children?: ReactNode;
    enabled?: boolean;
    keyboardActions?: { onDone?: (value: string) => void };
    minLines?: number;
    modifiers?: readonly { $type: string }[];
    onValueChange?: (value: string) => void;
    singleLine?: boolean;
    value?: { value: string; set: (value: string) => void };
  }) {
    // The field is found by its M3 label (or placeholder) text.
    let label = "";
    Children.forEach(children, (child) => {
      if (
        child &&
        typeof child === "object" &&
        "type" in child &&
        (child.type === OutlinedTextField.Label ||
          child.type === OutlinedTextField.Placeholder)
      )
        label ||= extractText(
          (child as { props: { children: unknown } }).props.children,
        );
    });
    return (
      <TextInput
        accessibilityLabel={label}
        editable={enabled !== false}
        onChangeText={(text) => {
          // Typing writes the native state and fires onValueChange.
          value?.set(text);
          onValueChange?.(text);
        }}
        onSubmitEditing={() => keyboardActions?.onDone?.(value?.value ?? "")}
        value={value?.value}
        {...{ minLines, modifiers, singleLine }}
      />
    );
  }
  OutlinedTextField.Label = function Label() {
    return null;
  };
  OutlinedTextField.Placeholder = function Placeholder() {
    return null;
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
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxWidth: () => ({ $type: "fillMaxWidth" }),
  paddingAll: (value: number) => ({ $type: "paddingAll", value }),
  weight: (value: number) => ({ $type: "weight", value }),
}));

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { TopicEditForm } from "@/features/topics/ui/topic-edit-form.android";

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

describe("TopicEditForm (Android)", () => {
  test("prefills title/body and reports a title+body patch on submit", async () => {
    const onSave = jest.fn();
    const ref = createRef<TopicEditFormRef>();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody
        canEditTags={false}
        onCancel={jest.fn()}
        onSave={onSave}
        onValidityChange={jest.fn()}
        ref={ref}
        tags={[]}
        topic={topic}
      />,
    );
    expect(screen.getByLabelText("제목").props.value).toBe("원래 제목");
    expect(screen.getByLabelText("본문").props.value).toBe("원래 본문");
    await fireEvent.changeText(screen.getByLabelText("제목"), "새 제목");
    await fireEvent.changeText(screen.getByLabelText("본문"), "새 본문");
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: { title: "새 제목", body: "새 본문" },
      tags: null,
    });
  });

  test("removing the only tag (✕) and submitting reports an empty tag set", async () => {
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
    await fireEvent.press(
      screen.getByRole("button", { name: "여행 태그 제거" }),
    );
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({ patch: null, tags: [] });
  });

  test("labelled M3 fields: a single-line 제목 and a multi-line 본문", async () => {
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody
        canEditTags
        onCancel={jest.fn()}
        onSave={jest.fn()}
        onValidityChange={jest.fn()}
        tags={[]}
        topic={topic}
      />,
    );
    expect(screen.getByLabelText("제목").props.singleLine).toBe(true);
    expect(screen.getByLabelText("본문").props.minLines).toBeGreaterThan(1);
    expect(screen.getByText("태그")).toBeTruthy();
  });

  test("the new-tag field takes the remaining row width so 추가 stays visible", async () => {
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody={false}
        canEditTags
        onCancel={jest.fn()}
        onSave={jest.fn()}
        onValidityChange={jest.fn()}
        tags={[]}
        topic={topic}
      />,
    );
    const modifiers = screen.getByLabelText("새 태그").props.modifiers as {
      $type: string;
    }[];
    // fillMaxWidth() inside the Row pushed the 추가 button off screen.
    expect(modifiers.map((modifier) => modifier.$type)).toEqual(["weight"]);
    expect(screen.getByRole("button", { name: "추가" })).toBeTruthy();
    // Disabled while the field is empty, and it looks disabled too: the
    // label color changes once there is a tag to add.
    const idleColor = screen.getByText("추가").props.color as unknown;
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "산책");
    expect(screen.getByText("추가").props.color).not.toBe(idleColor);
  });

  test("추가 turns the typed tag into a chip and clears the field", async () => {
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
    await fireEvent.changeText(screen.getByLabelText("새 태그"), " 산책 ");
    await fireEvent.press(screen.getByRole("button", { name: "추가" }));
    expect(screen.getByText("#산책")).toBeTruthy();
    expect(screen.getByLabelText("새 태그").props.value).toBe("");
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: null,
      tags: [
        { confidence: null, source: "user", tag: "여행" },
        { confidence: null, source: "user", tag: "산책" },
      ],
    });
  });

  test("the keyboard Done action adds the tag like 추가", async () => {
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody={false}
        canEditTags
        onCancel={jest.fn()}
        onSave={jest.fn()}
        onValidityChange={jest.fn()}
        tags={[]}
        topic={topic}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "산책");
    await fireEvent(screen.getByLabelText("새 태그"), "submitEditing");
    expect(screen.getByText("#산책")).toBeTruthy();
    expect(screen.getByLabelText("새 태그").props.value).toBe("");
  });

  test("a typed tag that was not added yet is still saved, and Save is enabled for it", async () => {
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
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "산책");
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    ref.current!.submit();
    expect(onSave).toHaveBeenCalledWith({
      patch: null,
      tags: [{ confidence: null, source: "user", tag: "산책" }],
    });
  });

  test("adding a tag that is already there clears the field without a duplicate chip", async () => {
    const onValidityChange = jest.fn();
    const screen = await render(
      <TopicEditForm
        busy={false}
        canEditBody={false}
        canEditTags
        onCancel={jest.fn()}
        onSave={jest.fn()}
        onValidityChange={onValidityChange}
        tags={tags}
        topic={topic}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("새 태그"), "여행");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    await fireEvent.press(screen.getByRole("button", { name: "추가" }));
    expect(screen.getAllByText("#여행")).toHaveLength(1);
    expect(screen.getByLabelText("새 태그").props.value).toBe("");
  });
});
