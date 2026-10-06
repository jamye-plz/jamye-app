import { render } from "@testing-library/react-native";
import React from "react";

import { ChatComposerField } from "../../../src/features/chat/ui/chat-composer-field.ios";

// C15: mirrors `chat-composer.test.tsx`'s `@expo/ui/swift-ui` mock (same
// opaque-host workaround, see that file's docstring), narrowed to this field
// in isolation, plus it additionally surfaces the resolved `lineLimit`
// modifier's `{ min, max }` range as inert extra props on the stand-in
// `TextInput` so the fontScale -> max-lines wiring is assertable without
// reaching into the (mocked, opaque) SwiftUI host tree.
jest.mock("@expo/ui/swift-ui", () => {
  const actual =
    jest.requireActual<Record<string, unknown>>("@expo/ui/swift-ui");
  const React = jest.requireActual<typeof import("react")>("react");
  const { TextInput } =
    jest.requireActual<typeof import("react-native")>("react-native");
  // Typed escape hatch (matches `AnyPressable`/`AnyView` elsewhere in this
  // repo, e.g. `tests/features/groups/ui/groups-home.test.tsx`): the mock
  // stashes the resolved `lineLimit` range on `lineLimitMax`/`lineLimitMin`,
  // two inert props that are not part of RN's real `TextInputProps`.
  const AnyTextInput = TextInput as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  function extractLabel(modifiers?: readonly unknown[]): string | undefined {
    const found = modifiers?.find(
      (modifier): modifier is { $type: string; value: string } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "accessibilityLabel",
    );
    return found?.value;
  }
  function extractLineLimitRange(
    modifiers?: readonly unknown[],
  ): { min?: number; max?: number } | undefined {
    const found = modifiers?.find(
      (
        modifier,
      ): modifier is {
        $type: string;
        range: { min?: number; max?: number };
      } =>
        typeof modifier === "object" &&
        modifier !== null &&
        (modifier as { $type?: unknown }).$type === "lineLimit",
    );
    return found?.range;
  }
  const TextField = React.forwardRef(function MockSwiftUITextField(
    props: {
      axis?: string;
      modifiers?: readonly unknown[];
      onFocusChange?: (focused: boolean) => void;
      onTextChange?: (text: string) => void;
      placeholder?: string;
    },
    ref: React.Ref<{ clear: () => void; focus: () => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      clear: () => undefined,
      focus: () => undefined,
    }));
    const range = extractLineLimitRange(props.modifiers);
    return (
      <AnyTextInput
        accessibilityLabel={extractLabel(props.modifiers)}
        lineLimitMax={range?.max}
        lineLimitMin={range?.min}
        multiline={props.axis === "vertical"}
        onBlur={() => props.onFocusChange?.(false)}
        onChangeText={props.onTextChange}
        onFocus={() => props.onFocusChange?.(true)}
        placeholder={props.placeholder}
      />
    );
  });
  return { ...actual, TextField };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  accessibilityLabel: (value: string) => ({
    $type: "accessibilityLabel",
    value,
  }),
  lineLimit: (range: unknown) => ({ $type: "lineLimit", range }),
}));

/**
 * C15 (task-coord-device-acceptance, RUN_ID 8447a0dd-3b1d-48cd-875a-797dde29aa9b):
 * `chat-composer-field.ios.tsx` must read `fontScale` from
 * `useWindowDimensions()` and pass `composerMaxLines(fontScale)` as the
 * `lineLimit` modifier's `max`, instead of the fixed `{ min: 1, max: 5 }`.
 * See `tests/features/chat/composer-max-lines.test.ts` for the arithmetic.
 *
 * Spies on the REAL `react-native` module object (`jest.requireActual`, not
 * an `import * as` namespace copy -- Babel's wildcard interop makes that
 * copy ineffective here) so the field's own
 * `import { useWindowDimensions } from "react-native"` call site observes
 * the mocked return value. RN's jest default `fontScale` is 2, so every
 * case below pins it explicitly.
 *
 * GREEN (Stage B): the field now reads `fontScale` via
 * `useWindowDimensions()` and passes `composerMaxLines(fontScale)` as
 * `lineLimit`'s `max`, grounded in `composer-max-lines.ts`.
 */
describe("C15 ChatComposerField.ios fontScale-aware line limit", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps the 1...5 range at the default fontScale (1), unchanged", async () => {
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    jest.spyOn(RN, "useWindowDimensions").mockReturnValue({
      fontScale: 1,
      height: 844,
      scale: 3,
      width: 390,
    });

    const screen = await render(
      <ChatComposerField
        accessibilityLabel="메시지 입력"
        onChangeText={jest.fn()}
        placeholder="메시지"
        value=""
      />,
    );

    const input = screen.getByLabelText("메시지 입력");
    expect(input.props.lineLimitMin).toBe(1);
    expect(input.props.lineLimitMax).toBe(5);
  });

  test("C15: shrinks the max line count at AX2-scale fontScale (~2.14) so the field stays within the 120pt cap", async () => {
    const RN =
      jest.requireActual<typeof import("react-native")>("react-native");
    jest.spyOn(RN, "useWindowDimensions").mockReturnValue({
      fontScale: 2.14,
      height: 844,
      scale: 3,
      width: 390,
    });

    const screen = await render(
      <ChatComposerField
        accessibilityLabel="메시지 입력"
        onChangeText={jest.fn()}
        placeholder="메시지"
        value=""
      />,
    );

    const input = screen.getByLabelText("메시지 입력");
    expect(input.props.lineLimitMax).toBe(2);
  });
});
