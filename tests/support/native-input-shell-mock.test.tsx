import { fireEvent, render } from "@testing-library/react-native";

import type { NativeInputShellProps } from "@/shared/ui/native-input-shell.types";

import { NativeInputShellMock } from "./native-input-shell-mock";

/**
 * F5/C18/GROUPS-AC8: regression-locks the mock's uncontrolled-field
 * behavior against the two real native shells it stands in for.
 */
function baseProps(
  overrides: Partial<NativeInputShellProps> = {},
): NativeInputShellProps {
  return {
    onCancel: jest.fn(),
    onChangeValue: jest.fn(),
    onSubmit: jest.fn(),
    submitLabel: "만들기",
    testID: "shell",
    title: "새 그룹",
    value: "",
    ...overrides,
  };
}

describe("NativeInputShellMock", () => {
  test("seeds the field from initialValue on mount and ignores the value prop", async () => {
    const props = baseProps({ initialValue: "초기값", value: "다른 값" });
    const screen = await render(<NativeInputShellMock {...props} />);
    expect(screen.getByDisplayValue("초기값")).toBeTruthy();
  });

  test("starts empty when initialValue is not given, even if value is set", async () => {
    const props = baseProps({ value: "무시되는 값" });
    const screen = await render(<NativeInputShellMock {...props} />);
    expect(screen.getByDisplayValue("")).toBeTruthy();
  });

  test("typing updates the field locally and calls onChangeValue", async () => {
    const props = baseProps({ initialValue: "초기값" });
    const screen = await render(<NativeInputShellMock {...props} />);
    await fireEvent.changeText(screen.getByDisplayValue("초기값"), "새 입력");
    expect(props.onChangeValue).toHaveBeenCalledWith("새 입력");
    expect(screen.getByDisplayValue("새 입력")).toBeTruthy();
  });

  test("re-seeds the field when initialValue changes after mount", async () => {
    const props = baseProps({ initialValue: "첫 값" });
    const screen = await render(<NativeInputShellMock {...props} />);
    await screen.rerender(
      <NativeInputShellMock {...props} initialValue="두 번째 값" />,
    );
    expect(screen.getByDisplayValue("두 번째 값")).toBeTruthy();
  });

  // R6 (REFINE): matches the real shells' re-seed guard
  // (`if (initialValue !== undefined) …set(initialValue)`), which never
  // clears the field when a later render's `initialValue` goes missing.
  test("keeps the field when initialValue goes from a string to undefined", async () => {
    const props = baseProps({ initialValue: "첫 값" });
    const screen = await render(<NativeInputShellMock {...props} />);
    await fireEvent.changeText(screen.getByDisplayValue("첫 값"), "typed");
    await screen.rerender(
      <NativeInputShellMock {...props} initialValue={undefined} />,
    );
    expect(screen.getByDisplayValue("typed")).toBeTruthy();
  });
});
