import { fireEvent, render } from "@testing-library/react-native";
import React, { createRef } from "react";
import { TextInput } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { FormField } from "@/shared/ui/form-field";

describe("FormField", () => {
  test("is queryable by its label and forwards text changes", async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <AppThemeProvider>
        <FormField label="그룹 이름" onChangeText={onChangeText} />
      </AppThemeProvider>,
    );
    const input = screen.getByLabelText("그룹 이름");
    fireEvent.changeText(input, "새 그룹");
    expect(onChangeText).toHaveBeenCalledWith("새 그룹");
  });

  test("renders helper text and an alert-role error", async () => {
    const screen = await render(
      <AppThemeProvider>
        <FormField
          error="유효하지 않은 코드입니다."
          helper="6자리 코드를 입력하세요."
          label="초대 코드"
        />
      </AppThemeProvider>,
    );
    expect(screen.getByText("6자리 코드를 입력하세요.")).toBeTruthy();
    const error = screen.getByRole("alert");
    expect(error.props.children).toBe("유효하지 않은 코드입니다.");
  });

  test("applies textAlignVertical=top for multiline fields and forwards the ref", async () => {
    const ref = createRef<TextInput>();
    const screen = await render(
      <AppThemeProvider>
        <FormField label="본문" multiline ref={ref} />
      </AppThemeProvider>,
    );
    const input = screen.getByLabelText("본문");
    const flattenedStyle = [input.props.style].flat();
    expect(flattenedStyle).toContainEqual(
      expect.objectContaining({ textAlignVertical: "top" }),
    );
    expect(ref.current).not.toBeNull();
  });
});
