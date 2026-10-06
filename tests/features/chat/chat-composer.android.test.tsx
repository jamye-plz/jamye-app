import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { AppThemeProvider } from "../../../src/core/theme/theme-provider";
import type { MediaAttachmentController } from "../../../src/features/media/ui/media-attachment-types";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
// W1/W2 (Android, M3): `@expo/ui/jetpack-compose` renders as an opaque host
// node under jest (same reason as `@expo/ui/swift-ui`, see
// `chat-composer.test.tsx`), so each button/field gets an RN-equivalent
// stand-in per the project's per-test inline-mock convention. Types below
// reference `React.ReactNode` off the factory-local `requireActual`'d
// `React` (not a top-level import) -- jest.mock factories may not reference
// out-of-scope variables, including type-only ones.
jest.mock("@expo/ui/jetpack-compose", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, TextInput, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function makeIconButton() {
    return function MockIconButton({
      children,
      enabled = true,
      onClick,
    }: Readonly<{
      children?: React.ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }>) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !enabled }}
          disabled={!enabled}
          onPress={onClick}
        >
          {children}
        </Pressable>
      );
    };
  }
  const IconButton = makeIconButton();
  const FilledIconButton = makeIconButton();
  // The button glyphs are Compose `Icon`s; their contentDescription is the
  // button's TalkBack name.
  function Icon({
    contentDescription,
  }: Readonly<{ contentDescription?: string }>) {
    return <View accessibilityLabel={contentDescription} />;
  }
  function Row({ children }: Readonly<{ children?: React.ReactNode }>) {
    return <View>{children}</View>;
  }
  // The placeholder slot must hold a Compose `Text` element: a bare string
  // there is an RN text node outside <Text> and throws on device.
  function extractPlaceholder(children: React.ReactNode): string | undefined {
    let found: string | undefined;
    React.Children.forEach(children, (child) => {
      const slotChild = (child as { props?: { children?: unknown } } | null)
        ?.props?.children;
      if (typeof slotChild === "string") {
        throw new Error("TextField.Placeholder needs a Compose Text child");
      }
      const text = (slotChild as { props?: { children?: unknown } } | null)
        ?.props?.children;
      if (typeof text === "string") found = text;
    });
    return found;
  }
  // A11YF-AC2: mirrors the real `semantics({ contentDescription })` /
  // `testID(...)` modifier shapes (see the factory-local mock above) so the
  // field's Korean accessibility name and stable testID are observable the
  // same way they would be on the real native `TextField`.
  function extractModifierContentDescription(
    modifiers?: readonly unknown[],
  ): string | undefined {
    const found = modifiers?.find(
      (modifier): modifier is { $type: string; contentDescription?: string } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "semantics",
    );
    return found?.contentDescription;
  }
  function extractModifierTestId(
    modifiers?: readonly unknown[],
  ): string | undefined {
    const found = modifiers?.find(
      (modifier): modifier is { $type: string; value?: string } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "testID",
    );
    return found?.value;
  }
  // `Object.assign` (not a post-hoc `as unknown as {...}` cast with an
  // inline call-signature type) lets TypeScript infer the combined shape,
  // which keeps this factory free of type-literal call signatures --
  // jest's "no out-of-scope variable" hoisting check misreads a parameter
  // name inside one of those as a real out-of-scope identifier reference.
  const TextField = Object.assign(
    React.forwardRef(function MockComposeTextField(
      props: {
        children?: React.ReactNode;
        maxLines?: number;
        minLines?: number;
        modifiers?: readonly unknown[];
        onFocusChanged?: (focused: boolean) => void;
        onValueChange?: (text: string) => void;
      },
      ref: React.Ref<{ clear: () => void }>,
    ) {
      const [text, setText] = React.useState("");
      React.useImperativeHandle(ref, () => ({
        clear: () => setText(""),
        focus: () => undefined,
      }));
      return (
        <TextInput
          accessibilityLabel={extractModifierContentDescription(
            props.modifiers,
          )}
          // Inert extra props (not part of RN's `TextInputProps`): surface the
          // Compose `TextField`'s line range so it is assertable below.
          {...{ maxLines: props.maxLines, minLines: props.minLines }}
          multiline
          onBlur={() => props.onFocusChanged?.(false)}
          onChangeText={(next: string) => {
            setText(next);
            props.onValueChange?.(next);
          }}
          onFocus={() => props.onFocusChanged?.(true)}
          placeholder={extractPlaceholder(props.children)}
          testID={extractModifierTestId(props.modifiers)}
          value={text}
        />
      );
    }),
    // Never actually rendered -- `extractPlaceholder` reads this child
    // element's `props.children` directly from the JSX tree without
    // instantiating it, so it only needs to be a valid `createElement` type.
    { Placeholder: () => null },
  );
  const Shape = {
    RoundedCorner: (props: { cornerRadii?: Record<string, number> }) => ({
      ...props,
      type: "roundedCorner",
    }),
  };
  function Text({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  }
  return { FilledIconButton, Icon, IconButton, Row, Shape, Text, TextField };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  // A11YF-AC2: the real modifiers forward a Korean accessibility name via
  // `semantics({ contentDescription })` and a stable id via `testID(...)`;
  // the mock below reproduces the same `$type` shape so the field's own
  // `modifiers` prop can be inspected the same way the real native one
  // would be.
  semantics: (params: { contentDescription?: string }) => ({
    $type: "semantics",
    ...params,
  }),
  testID: (tag: string) => ({ $type: "testID", value: tag }),
  weight: (value: number) => ({ $type: "weight", value }),
}));

function fakeAttachmentController(): MediaAttachmentController {
  return {
    items: [],
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
  };
}

type ChatComposerModule = { ChatComposer?: unknown };
type ChatComposer = (props: {
  controller: { send: (input: never) => Promise<{ outcome: string }> };
  attachmentController?: MediaAttachmentController | null;
}) => React.JSX.Element;

function loadAndroidComposer(): ChatComposer {
  const module = jest.requireActual<ChatComposerModule>(
    "../../../src/features/chat/ui/chat-composer.android.tsx",
  );
  return module.ChatComposer as ChatComposer;
}

describe("ChatComposer (Android, M3)", () => {
  test("W1: renders the M3 idle row (+ icon button, filled text field, mic<->send toggle)", async () => {
    const ChatComposer = loadAndroidComposer();
    const send = jest.fn(
      async (input: { body: string; clearDraft: () => void }) => {
        input.clearDraft();
        return { outcome: "committed" as const };
      },
    );
    const attachment = fakeAttachmentController();
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer attachmentController={attachment} controller={{ send }} />
      </AppThemeProvider>,
    );

    expect(screen.getByLabelText("첨부 추가")).toBeTruthy();
    expect(screen.getByLabelText("음성 메시지 녹음")).toBeTruthy();
    expect(screen.queryByLabelText("메시지 보내기")).toBeNull();

    const field = screen.getByPlaceholderText("메시지");
    await fireEvent.changeText(field, "안녕하세요");
    expect(screen.getByLabelText("메시지 보내기")).toBeTruthy();
    expect(screen.queryByLabelText("음성 메시지 녹음")).toBeNull();

    await fireEvent.press(screen.getByLabelText("메시지 보내기"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ body: "안녕하세요" }),
    );
    // E11: a successful send clears the field (ref.clear()) while it stays mounted.
    expect(screen.getByPlaceholderText("메시지").props.value).toBe("");
  });

  test("E11: Return never sends on the M3 field either -- only the explicit button does", async () => {
    const ChatComposer = loadAndroidComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const attachment = fakeAttachmentController();
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer attachmentController={attachment} controller={{ send }} />
      </AppThemeProvider>,
    );
    const field = screen.getByPlaceholderText("메시지");
    await fireEvent.changeText(field, "한 줄\n다음 줄");
    await act(async () => {
      await fireEvent(field, "keyPress", { nativeEvent: { key: "Enter" } });
    });
    expect(send).not.toHaveBeenCalled();
    expect(field.props.value).toBe("한 줄\n다음 줄");
  });

  test("A11YF-AC2: the field carries the Korean accessibility name and a stable testID for E2E", async () => {
    const ChatComposer = loadAndroidComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const attachment = fakeAttachmentController();
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer attachmentController={attachment} controller={{ send }} />
      </AppThemeProvider>,
    );

    // A11YF-AC2 (public contract, consumed by task-mobile-e2e-setup):
    // testID "chat-composer-input" identifies the Android composer's text
    // field, whose accessibility name must read "메시지 입력".
    const field = screen.getByTestId("chat-composer-input");
    expect(field.props.accessibilityLabel).toBe("메시지 입력");
  });

  test("C15: the field is capped at 5 visible lines (min 1), matching the iOS field's ceiling", async () => {
    const ChatComposer = loadAndroidComposer();
    const send = jest.fn(async () => ({ outcome: "empty" as const }));
    const screen = await render(
      <AppThemeProvider>
        <ChatComposer
          attachmentController={fakeAttachmentController()}
          controller={{ send }}
        />
      </AppThemeProvider>,
    );

    const field = screen.getByTestId("chat-composer-input");
    expect(field.props.maxLines).toBe(5);
    expect(field.props.minLines).toBe(1);
  });
});
