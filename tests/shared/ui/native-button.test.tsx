// Intentionally NO `jest.mock("@expo/ui")` here: this proves
// `tests/__mocks__/@expo/ui.tsx` is picked up automatically by jest `roots`.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { NativeButton } from "@/shared/ui/native-button";

describe("NativeButton", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the label and fires onPress", async () => {
    const onPress = jest.fn();
    await render(
      <AppThemeProvider>
        <NativeButton label="가입하기" onPress={onPress} />
      </AppThemeProvider>,
    );
    fireEvent.press(screen.getByText("가입하기"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a busy label and disables the button while busy", async () => {
    const onPress = jest.fn();
    await render(
      <AppThemeProvider>
        <NativeButton busy label="가입하기" onPress={onPress} />
      </AppThemeProvider>,
    );
    expect(screen.getByText("가입하기 처리 중…")).toBeTruthy();
    const button = screen.getByRole("button");
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("disables while retryAt is in the future and re-enables once it elapses", async () => {
    jest.useFakeTimers();
    const now = Date.now();
    const onPress = jest.fn();
    await render(
      <AppThemeProvider>
        <NativeButton
          label="다시 시도"
          onPress={onPress}
          retryAt={now + 5000}
        />
      </AppThemeProvider>,
    );
    expect(screen.getByRole("button").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("button").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it("renders a destructive variant without throwing", async () => {
    await render(
      <AppThemeProvider>
        <NativeButton
          destructive
          label="그룹 삭제"
          onPress={jest.fn()}
          variant="outlined"
        />
      </AppThemeProvider>,
    );
    expect(screen.getByText("그룹 삭제")).toBeTruthy();
  });
});
