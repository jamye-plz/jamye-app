import { fireEvent, render } from "@testing-library/react-native";
import type { ComponentType, ReactNode } from "react";
import { Pressable, Text as RNText } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type {
  SystemFeedbackContextValue,
  SystemFeedbackOptions,
} from "@/shared/ui/system-feedback.types";

type MockSnackbarHostRef = Readonly<{
  showSnackbar: (options: {
    actionLabel?: string;
    message: string;
  }) => Promise<"actionPerformed" | "dismissed">;
}>;

// `jest.mock` factories may only reference `mock`-prefixed out-of-scope
// identifiers (enforced by babel-plugin-jest-hoist), so the controllable fake
// and its result both carry the prefix.
let mockSnackbarResult: "actionPerformed" | "dismissed" = "dismissed";
const mockShowSnackbar = jest.fn(
  async (options: { actionLabel?: string; message: string }) => {
    void options;
    return mockSnackbarResult;
  },
);

jest.mock("@expo/ui/jetpack-compose", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as ComponentType<Record<string, unknown>>;
  const SnackbarHost = react.forwardRef<
    MockSnackbarHostRef,
    Readonly<{ modifiers?: unknown[] }>
  >(function MockSnackbarHost(_props, ref) {
    react.useImperativeHandle(ref, () => ({
      showSnackbar: mockShowSnackbar,
    }));
    return <AnyView testID="compose-snackbar-host" />;
  });
  return { SnackbarHost };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroidSystemFeedback() {
  return jest.requireActual<{
    SystemFeedbackHost: ComponentType<{
      children?: ReactNode;
      testID?: string;
    }>;
    useSystemFeedback: () => SystemFeedbackContextValue;
  }>("../../../src/shared/ui/system-feedback.android.tsx");
}

function Screen({
  notice,
  useSystemFeedback,
}: Readonly<{
  notice: SystemFeedbackOptions;
  useSystemFeedback: () => SystemFeedbackContextValue;
}>) {
  const { showNotice } = useSystemFeedback();
  return (
    <Pressable accessibilityRole="button" onPress={() => showNotice(notice)}>
      <RNText>열기</RNText>
    </Pressable>
  );
}

describe("useSystemFeedback (Android)", () => {
  beforeEach(() => {
    mockShowSnackbar.mockClear();
    mockSnackbarResult = "dismissed";
  });

  test("shows a Snackbar with the message and action label", async () => {
    const { SystemFeedbackHost, useSystemFeedback } =
      loadAndroidSystemFeedback();
    const screen = await render(
      <AppThemeProvider>
        <SystemFeedbackHost testID="feedback">
          <Screen
            notice={{
              actionLabel: "다시 시도",
              message: "알림을 열 수 없습니다.",
            }}
            useSystemFeedback={useSystemFeedback}
          />
        </SystemFeedbackHost>
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByText("열기"));
    expect(mockShowSnackbar).toHaveBeenCalledWith({
      actionLabel: "다시 시도",
      message: "알림을 열 수 없습니다.",
    });
  });

  test("runs onAction when the Snackbar action is performed", async () => {
    mockSnackbarResult = "actionPerformed";
    const onAction = jest.fn();
    const { SystemFeedbackHost, useSystemFeedback } =
      loadAndroidSystemFeedback();
    const screen = await render(
      <AppThemeProvider>
        <SystemFeedbackHost>
          <Screen
            notice={{
              actionLabel: "다시 시도",
              message: "알림을 열 수 없습니다.",
              onAction,
            }}
            useSystemFeedback={useSystemFeedback}
          />
        </SystemFeedbackHost>
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByText("열기"));
    await mockShowSnackbar.mock.results[0]?.value;
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("does not run onAction when the Snackbar is dismissed without the action", async () => {
    mockSnackbarResult = "dismissed";
    const onAction = jest.fn();
    const { SystemFeedbackHost, useSystemFeedback } =
      loadAndroidSystemFeedback();
    const screen = await render(
      <AppThemeProvider>
        <SystemFeedbackHost>
          <Screen
            notice={{
              message: "더 이상 접근할 수 없는 알림입니다.",
              onAction,
            }}
            useSystemFeedback={useSystemFeedback}
          />
        </SystemFeedbackHost>
      </AppThemeProvider>,
    );
    await fireEvent.press(screen.getByText("열기"));
    await mockShowSnackbar.mock.results[0]?.value;
    expect(onAction).not.toHaveBeenCalled();
  });
});
