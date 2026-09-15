import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppScreen, resolveScreenPadding } from "@/shared/ui/app-screen";

jest.mock("react-native-safe-area-context", () => {
  const mockActual = jest.requireActual<
    typeof import("react-native-safe-area-context")
  >("react-native-safe-area-context");

  return {
    ...mockActual,
    useSafeAreaInsets: () => ({ bottom: 20, left: 0, right: 0, top: 44 }),
  };
});

describe("resolveScreenPadding", () => {
  const insets = { bottom: 20, left: 0, right: 0, top: 44 };

  test("ios headered screen defers header/bottom safe-area to the native ScrollView inset", () => {
    expect(resolveScreenPadding({ headered: true, insets, os: "ios" })).toEqual(
      {
        paddingBottom: appSpacing.md,
        paddingTop: appSpacing.md,
      },
    );
  });

  test("ios headerless screen adds top and bottom insets manually", () => {
    expect(
      resolveScreenPadding({ headered: false, insets, os: "ios" }),
    ).toEqual({
      paddingBottom: insets.bottom + appSpacing.md,
      paddingTop: insets.top + appSpacing.md,
    });
  });

  test("android headered screen still adds the bottom inset manually", () => {
    expect(
      resolveScreenPadding({ headered: true, insets, os: "android" }),
    ).toEqual({
      paddingBottom: insets.bottom + appSpacing.md,
      paddingTop: appSpacing.md,
    });
  });

  test("android headerless screen adds top and bottom insets manually", () => {
    expect(
      resolveScreenPadding({ headered: false, insets, os: "android" }),
    ).toEqual({
      paddingBottom: insets.bottom + appSpacing.md,
      paddingTop: insets.top + appSpacing.md,
    });
  });
});

describe("AppScreen", () => {
  test("renders children with automatic inset adjustment and the default keyboardShouldPersistTaps", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AppScreen testID="app-screen">
          <Text>hello</Text>
        </AppScreen>
      </AppThemeProvider>,
    );
    expect(screen.getByText("hello")).toBeTruthy();
    const scrollView = screen.getByTestId("app-screen");
    expect(scrollView.props.contentInsetAdjustmentBehavior).toBe("automatic");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
  });

  test("respects backgroundColor and contentStyle overrides", async () => {
    const screen = await render(
      <AppThemeProvider>
        <AppScreen
          backgroundColor="#123456"
          contentStyle={{ paddingBottom: 100 }}
          testID="app-screen"
        >
          <Text>hello</Text>
        </AppScreen>
      </AppThemeProvider>,
    );
    const scrollView = screen.getByTestId("app-screen");
    const flattenedStyle = [scrollView.props.style].flat();
    expect(flattenedStyle).toContainEqual(
      expect.objectContaining({ backgroundColor: "#123456" }),
    );
    const flattenedContentStyle = [
      scrollView.props.contentContainerStyle,
    ].flat();
    expect(flattenedContentStyle).toContainEqual(
      expect.objectContaining({ paddingBottom: 100 }),
    );
  });
});

describe("AppScreen provider-less rendering (error-boundary fallback path)", () => {
  test("renders outside AppThemeProvider and SafeAreaProvider without throwing", async () => {
    const { AppScreen: BareAppScreen } = jest.requireActual<
      typeof import("@/shared/ui/app-screen")
    >("@/shared/ui/app-screen");
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    const screen = await render(
      <BareAppScreen headered={false} testID="bare-screen">
        <Text>bare</Text>
      </BareAppScreen>,
    );
    expect(screen.getByTestId("bare-screen")).toBeTruthy();
    expect(screen.getByText("bare")).toBeTruthy();
  });
});
