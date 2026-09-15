import { fireEvent, render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";

describe("HeaderIconButton", () => {
  it("exposes accessibilityRole button with the given label and fires onPress", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <AppThemeProvider>
        <HeaderIconButton
          accessibilityLabel="추가"
          onPress={onPress}
          symbol="add"
        />
      </AppThemeProvider>,
    );
    const button = getByRole("button", { name: "추가" });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("reflects the disabled accessibility state and does not fire onPress", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <AppThemeProvider>
        <HeaderIconButton
          accessibilityLabel="추가"
          disabled
          onPress={onPress}
          symbol="add"
        />
      </AppThemeProvider>,
    );
    const button = getByRole("button", { name: "추가" });
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders a 44pt square hit target", async () => {
    const { getByRole } = await render(
      <AppThemeProvider>
        <HeaderIconButton
          accessibilityLabel="추가"
          onPress={jest.fn()}
          symbol="add"
        />
      </AppThemeProvider>,
    );
    expect(getByRole("button", { name: "추가" })).toHaveStyle({
      minHeight: 44,
      minWidth: 44,
    });
  });
});
