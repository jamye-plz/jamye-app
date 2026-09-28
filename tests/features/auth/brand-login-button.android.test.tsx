import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

// Each modifier records its name and arguments so the tests can check what
// the Compose tree is built from.
jest.mock("@expo/ui/jetpack-compose/modifiers", () => {
  const tag =
    (name: string) =>
    (...args: unknown[]) => ({ args, name });
  return {
    background: tag("background"),
    border: tag("border"),
    clip: tag("clip"),
    defaultMinSize: tag("defaultMinSize"),
    fillMaxWidth: tag("fillMaxWidth"),
    paddingAll: tag("paddingAll"),
    Shapes: {
      RoundedCorner: (radius: number) => ({ roundedCorner: radius }),
    },
    size: tag("size"),
  };
});

type Modifier = Readonly<{ args: readonly unknown[]; name: string }>;

jest.mock("@expo/ui/jetpack-compose", () => {
  const {
    ActivityIndicator,
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Button({
    children,
    onClick,
  }: Readonly<{
    children?: ReactNode;
    colors?: unknown;
    enabled?: boolean;
    modifiers?: readonly unknown[];
    onClick?: () => void;
  }>) {
    // `require` (not `jest.requireMock`) returns the same "@expo/ui" mock
    // instance the component under test imports, so the Host context matches.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use ES import
    const hostGuard = require("@expo/ui") as {
      useMockHostGuard: (component: string) => void;
    };
    hostGuard.useMockHostGuard("Button");
    return (
      <Pressable
        accessibilityRole="button"
        disabled={!onClick}
        onPress={onClick}
      >
        {children}
      </Pressable>
    );
  }
  function Box({
    children,
    modifiers,
  }: MockChildren & Readonly<{ modifiers?: readonly unknown[] }>) {
    return (
      <View testID="brand-button-frame" {...{ modifiers }}>
        {children}
      </View>
    );
  }
  function Row({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  function Image({
    contentDescription,
    modifiers,
  }: Readonly<{
    contentDescription?: string | null;
    modifiers?: readonly unknown[];
  }>) {
    return (
      <View
        accessibilityLabel={contentDescription ?? undefined}
        testID="brand-logo-image"
        {...{ modifiers }}
      />
    );
  }
  function CircularProgressIndicator() {
    return <ActivityIndicator testID="brand-login-busy" />;
  }
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  return { Box, Button, CircularProgressIndicator, Image, Row, Text };
});

const { BrandLoginButton } = jest.requireActual<
  typeof import("@/features/auth/ui/brand-login-button.android")
>("@/features/auth/ui/brand-login-button.android");

describe("BrandLoginButton (Android)", () => {
  test("renders the label and calls onPress", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <BrandLoginButton
        label="카카오로 계속하기"
        onPress={onPress}
        provider="kakao"
      />,
    );
    expect(screen.getByText("카카오로 계속하기")).toBeTruthy();
    const button = screen.getByRole("button");
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("shows a busy indicator and stays non-interactive while busy", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <BrandLoginButton
        busy
        label="Google로 계속하기"
        onPress={onPress}
        provider="google"
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByTestId("brand-login-busy")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  test("disabled without busy still blocks interaction and shows no spinner", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <BrandLoginButton
        disabled
        label="카카오로 계속하기"
        onPress={onPress}
        provider="kakao"
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.queryByTestId("brand-login-busy")).toBeNull();
  });

  test("renders the official logo image for each provider", async () => {
    const screen = await render(
      <BrandLoginButton
        label="Google로 계속하기"
        onPress={jest.fn()}
        provider="google"
      />,
    );
    expect(screen.getByTestId("brand-logo-image")).toBeTruthy();
  });

  async function frameModifiers(provider: "google" | "kakao") {
    const screen = await render(
      <BrandLoginButton
        label="label"
        onPress={jest.fn()}
        provider={provider}
      />,
    );
    return {
      frame: screen.getByTestId("brand-button-frame").props
        .modifiers as readonly Modifier[],
      logo: screen.getByTestId("brand-logo-image").props
        .modifiers as readonly Modifier[],
    };
  }

  test("draws Google's outline as a ring around the rounded button (device regression: the shapeless border drew a rectangle)", async () => {
    const { frame } = await frameModifiers("google");
    expect(frame.map((modifier) => modifier.name)).toEqual([
      "fillMaxWidth",
      "clip",
      "background",
      "paddingAll",
    ]);
    expect(frame[1]!.args[0]).toEqual({ roundedCorner: 24 });
    expect(frame[2]!.args[0]).toBe("#747775");
    expect(frame[3]!.args[0]).toBe(1);
  });

  test("Kakao has no outline, and both logos get an explicit 18dp box", async () => {
    const kakao = await frameModifiers("kakao");
    expect(kakao.frame.map((modifier) => modifier.name)).toEqual([
      "fillMaxWidth",
    ]);
    expect(kakao.logo).toEqual([{ args: [18, 18], name: "size" }]);
    const google = await frameModifiers("google");
    expect(google.logo).toEqual([{ args: [18, 18], name: "size" }]);
  });

  test("busy puts the spinner in the logo's slot, so the label does not shift", async () => {
    const screen = await render(
      <BrandLoginButton
        busy
        label="Google로 계속하기"
        onPress={jest.fn()}
        provider="google"
      />,
    );
    expect(screen.getByTestId("brand-login-busy")).toBeTruthy();
    expect(screen.queryByTestId("brand-logo-image")).toBeNull();
  });
});
