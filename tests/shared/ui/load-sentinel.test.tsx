import { render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { LoadSentinel } from "@/shared/ui/load-sentinel";
import type { LoadSentinelProps } from "@/shared/ui/load-sentinel.types";

type ModifierRecord = Readonly<{
  $type: string;
  handler?: (visible?: boolean) => void;
  id?: string;
}>;

function findModifier(
  modifiers: readonly ModifierRecord[] | undefined,
  type: string,
): ModifierRecord | undefined {
  return modifiers?.find((modifier) => modifier.$type === type);
}

jest.mock("@expo/ui/swift-ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{
    children?: ReactNode;
    modifiers?: unknown[];
    testID?: string;
  }>;
  function VStack({ children, modifiers, testID }: MockChildren) {
    return (
      <AnyView modifiers={modifiers} testID={testID ?? "sentinel"}>
        {children}
      </AnyView>
    );
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  return { ProgressView, VStack };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  frame: (params: unknown) => ({ $type: "frame", params }),
  onAppear: (handler: () => void) => ({ $type: "onAppear", handler }),
}));

jest.mock("@expo/ui/jetpack-compose", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; modifiers?: unknown[] }>;
  function Column({ children, modifiers }: MockChildren) {
    return (
      <AnyView modifiers={modifiers} testID="sentinel">
        {children}
      </AnyView>
    );
  }
  function LoadingIndicator() {
    return <View testID="loading-indicator" />;
  }
  return { Column, LoadingIndicator };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  onVisibilityChanged: (handler: (visible: boolean) => void) => ({
    $type: "onVisibilityChanged",
    handler,
  }),
  size: (width: number, height: number) => ({ $type: "size", height, width }),
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroid() {
  return jest.requireActual<{
    LoadSentinel: (props: LoadSentinelProps) => React.JSX.Element;
  }>("../../../src/shared/ui/load-sentinel.android.tsx").LoadSentinel;
}

describe("LoadSentinel (iOS)", () => {
  test("onAppear fires onVisible when not loading", async () => {
    const onVisible = jest.fn();
    const screen = await render(
      <LoadSentinel onVisible={onVisible} testID="sentinel" />,
    );
    const modifiers = screen.getByTestId("sentinel").props
      .modifiers as ModifierRecord[];
    findModifier(modifiers, "onAppear")!.handler!();
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  test("while isLoading, appearing shows a spinner and does not call onVisible", async () => {
    const onVisible = jest.fn();
    const screen = await render(
      <LoadSentinel isLoading onVisible={onVisible} />,
    );
    expect(screen.getByTestId("progress-view")).toBeTruthy();
    const modifiers = screen.getByTestId("sentinel").props
      .modifiers as ModifierRecord[];
    findModifier(modifiers, "onAppear")!.handler!();
    expect(onVisible).not.toHaveBeenCalled();
  });

  test("once isLoading clears, a later appear fires again for the next cursor", async () => {
    const onVisible = jest.fn();
    const { getByTestId, rerender } = await render(
      <LoadSentinel isLoading onVisible={onVisible} testID="sentinel" />,
    );
    const modifiers = () =>
      getByTestId("sentinel").props.modifiers as ModifierRecord[];
    findModifier(modifiers(), "onAppear")!.handler!();
    expect(onVisible).not.toHaveBeenCalled();
    await rerender(<LoadSentinel onVisible={onVisible} testID="sentinel" />);
    findModifier(modifiers(), "onAppear")!.handler!();
    expect(onVisible).toHaveBeenCalledTimes(1);
  });
});

describe("LoadSentinel (Android)", () => {
  test("onVisibilityChanged(true) fires onVisible when not loading and forwards testID", async () => {
    const AndroidLoadSentinel = loadAndroid();
    const onVisible = jest.fn();
    const screen = await render(
      <AndroidLoadSentinel onVisible={onVisible} testID="sentinel" />,
    );
    const modifiers = screen.getByTestId("sentinel").props
      .modifiers as ModifierRecord[];
    findModifier(modifiers, "onVisibilityChanged")!.handler!(true);
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(findModifier(modifiers, "testID")?.id).toBe("sentinel");
  });

  test("onVisibilityChanged(false) never calls onVisible", async () => {
    const AndroidLoadSentinel = loadAndroid();
    const onVisible = jest.fn();
    const screen = await render(<AndroidLoadSentinel onVisible={onVisible} />);
    const modifiers = screen.getByTestId("sentinel").props
      .modifiers as ModifierRecord[];
    findModifier(modifiers, "onVisibilityChanged")!.handler!(false);
    expect(onVisible).not.toHaveBeenCalled();
  });

  test("isLoading suppresses the call even when visible", async () => {
    const AndroidLoadSentinel = loadAndroid();
    const onVisible = jest.fn();
    const screen = await render(
      <AndroidLoadSentinel isLoading onVisible={onVisible} />,
    );
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
    const modifiers = screen.getByTestId("sentinel").props
      .modifiers as ModifierRecord[];
    findModifier(modifiers, "onVisibilityChanged")!.handler!(true);
    expect(onVisible).not.toHaveBeenCalled();
  });
});
