import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { BrandLoginButton } from "@/features/auth/ui/brand-login-button.ios";

jest.mock("expo-image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use ES import
  const { Image: RNImage } = require("react-native");
  return {
    Image: (props: { source?: unknown }) => (
      <RNImage source={props.source} testID="brand-logo-image" />
    ),
  };
});

// Each modifier records its name and arguments so the tests can check the
// order SwiftUI applies them in.
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
    opacity: tag("opacity"),
    padding: tag("padding"),
    shapes: { capsule: () => ({ shape: "capsule" }) },
    strokeBorder: tag("strokeBorder"),
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
    // `require` (not `jest.requireMock`) returns the same "@expo/ui" mock
    // instance the component under test imports, so the Host context matches.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use ES import
    const hostGuard = require("@expo/ui") as {
      useMockHostGuard: (component: string) => void;
    };
    hostGuard.useMockHostGuard("Button");
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
      <View testID="brand-button-content" {...{ modifiers }}>
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
  return { Button, HStack, ProgressView, Text };
});

describe("BrandLoginButton (iOS)", () => {
  test("renders the label and calls onPress", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <BrandLoginButton
        label="카카오로 계속하기"
        onPress={onPress}
        provider="kakao"
      />,
    );
    const button = screen.getByRole("button", { name: "카카오로 계속하기" });
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
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    expect(button).toBeDisabled();
    expect(screen.getByTestId("google-login-busy")).toBeTruthy();
    await fireEvent.press(button);
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
    expect(
      screen.getByRole("button", { name: "카카오로 계속하기" }),
    ).toBeDisabled();
    expect(screen.queryByTestId("kakao-login-busy")).toBeNull();
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

  async function contentModifiers(provider: "google" | "kakao") {
    const screen = await render(
      <BrandLoginButton
        label="label"
        onPress={jest.fn()}
        provider={provider}
      />,
    );
    return screen.getByTestId("brand-button-content").props
      .modifiers as readonly Modifier[];
  }

  test("sizes the button to the full width before painting its capsule (device regression: the fill only covered the label, drawing small chips)", async () => {
    const modifiers = await contentModifiers("kakao");
    const names = modifiers.map((modifier) => modifier.name);
    const frameAt = names.indexOf("frame");
    const fillAt = names.indexOf("background");
    expect(modifiers[frameAt]!.args[0]).toEqual({
      maxWidth: Infinity,
      minHeight: 48,
    });
    expect(modifiers[fillAt]!.args).toEqual(["#FEE500", { shape: "capsule" }]);
    expect(frameAt).toBeGreaterThanOrEqual(0);
    expect(frameAt).toBeLessThan(fillAt);
    expect(names).not.toContain("strokeBorder");
  });

  test("traces Google's outline along the capsule, after the full-width frame", async () => {
    const modifiers = await contentModifiers("google");
    const names = modifiers.map((modifier) => modifier.name);
    const outline = modifiers[names.indexOf("strokeBorder")]!;
    expect(outline.args[0]).toMatchObject({
      content: "#747775",
      shape: "capsule",
    });
    expect(names.indexOf("frame")).toBeLessThan(names.indexOf("strokeBorder"));
  });

  test("busy puts the spinner in the logo's slot, so the label does not shift", async () => {
    const screen = await render(
      <BrandLoginButton
        busy
        label="카카오로 계속하기"
        onPress={jest.fn()}
        provider="kakao"
      />,
    );
    expect(screen.getByTestId("kakao-login-busy")).toBeTruthy();
    expect(screen.queryByTestId("brand-logo-image")).toBeNull();
  });
});
