import { act, fireEvent, render } from "@testing-library/react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import type { ReactNode } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { AppleLoginButton } from "@/features/auth/ui/apple-login-button.ios";

const mockIsAvailableAsync = jest.mocked(AppleAuthentication.isAvailableAsync);

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

// Each modifier records its name and arguments so the tests can check the
// exact fill/label colors U3 requires, mirroring
// brand-login-button.ios.test.tsx's "tag" mock.
jest.mock("@expo/ui/swift-ui/modifiers", () => {
  const tag =
    (name: string) =>
    (...args: unknown[]) => ({ args, name });
  return {
    background: tag("background"),
    buttonStyle: tag("buttonStyle"),
    contentShape: tag("contentShape"),
    disabled: tag("disabled"),
    font: tag("font"),
    foregroundStyle: tag("foregroundStyle"),
    frame: tag("frame"),
    padding: tag("padding"),
    shapes: { capsule: () => ({ shape: "capsule" }) },
  };
});

type Modifier = Readonly<{ args: readonly unknown[]; name: string }>;

jest.mock("@expo/ui/swift-ui", () => {
  const {
    ActivityIndicator,
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Button({
    children,
    label,
    onPress,
  }: Readonly<{
    children?: ReactNode;
    label?: string;
    onPress?: () => void;
    modifiers?: readonly unknown[];
  }>) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        disabled={!onPress}
        onPress={onPress}
      >
        {children ?? <RNText>{label}</RNText>}
      </Pressable>
    );
  }
  function HStack({
    children,
    modifiers,
  }: MockChildren & Readonly<{ modifiers?: readonly unknown[] }>) {
    return (
      <View testID="apple-button-content" {...{ modifiers }}>
        {children}
      </View>
    );
  }
  function ProgressView({ testID }: Readonly<{ testID?: string }>) {
    return <ActivityIndicator testID={testID} />;
  }
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  function Image({
    modifiers,
    testID,
  }: Readonly<{ modifiers?: readonly unknown[]; testID?: string }>) {
    return <View testID={testID} {...{ modifiers }} />;
  }
  return { Button, HStack, Image, ProgressView, Text };
});

async function renderButton(props: {
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return render(
    <AppThemeProvider>
      <AppleLoginButton
        busy={props.busy}
        disabled={props.disabled}
        onPress={props.onPress ?? jest.fn()}
      />
    </AppThemeProvider>,
  );
}

describe("AppleLoginButton (iOS)", () => {
  beforeEach(() => {
    mockIsAvailableAsync.mockClear();
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  test("stays hidden while isAvailableAsync has not resolved true (D16/U3)", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    const screen = await renderButton({});
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("renders the fixed Korean label and calls onPress once available", async () => {
    const onPress = jest.fn();
    const screen = await renderButton({ onPress });
    const button = await screen.findByRole("button", {
      name: "Apple로 로그인",
    });
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("shows a busy spinner in the logo slot and blocks interaction", async () => {
    const onPress = jest.fn();
    const screen = await renderButton({ busy: true, onPress });
    const button = await screen.findByRole("button", {
      name: "Apple로 로그인",
    });
    expect(button).toBeDisabled();
    expect(screen.getByTestId("apple-login-busy")).toBeTruthy();
    expect(screen.queryByTestId("apple-login-logo")).toBeNull();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("disabled without busy still blocks interaction and shows no spinner", async () => {
    const screen = await renderButton({ disabled: true });
    const button = await screen.findByRole("button", {
      name: "Apple로 로그인",
    });
    expect(button).toBeDisabled();
    expect(screen.queryByTestId("apple-login-busy")).toBeNull();
  });

  async function fillModifier() {
    const screen = await renderButton({});
    await screen.findByRole("button", { name: "Apple로 로그인" });
    const modifiers = screen.getByTestId("apple-button-content").props
      .modifiers as readonly Modifier[];
    return modifiers[
      modifiers.findIndex((modifier) => modifier.name === "background")
    ]!;
  }

  test("light mode: black fill, matching U3's light polarity", async () => {
    const fill = await fillModifier();
    expect(fill.args).toEqual(["#000000", { shape: "capsule" }]);
  });

  test("dark mode: white fill, matching U3's dark polarity", async () => {
    jest
      .requireMock<{ default: jest.Mock }>(
        "react-native/Libraries/Utilities/useColorScheme",
      )
      .default.mockReturnValue("dark");
    const fill = await fillModifier();
    expect(fill.args).toEqual(["#FFFFFF", { shape: "capsule" }]);
  });
});
