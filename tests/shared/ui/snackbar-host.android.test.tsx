import { act, render } from "@testing-library/react-native";
import { createRef } from "react";
import type { ComponentType, ReactNode, Ref } from "react";

import type { AndroidSnackbarHostProps } from "@/shared/ui/snackbar-host.android";

type MockSnackbarHostRef = Readonly<{
  showSnackbar: (options: {
    actionLabel?: string;
    message: string;
  }) => Promise<string>;
}>;

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function Host(
    props: Readonly<{
      children?: ReactNode;
      pointerEvents?: string;
      style?: unknown;
      testID?: string;
    }>,
  ) {
    return (
      <View
        pointerEvents={props.pointerEvents as never}
        style={props.style as never}
        testID={props.testID}
      >
        {props.children}
      </View>
    );
  }
  return { Host };
});

jest.mock("@expo/ui/jetpack-compose", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyView = View as unknown as ComponentType<Record<string, unknown>>;
  const SnackbarHost = react.forwardRef<
    MockSnackbarHostRef,
    Readonly<{ modifiers?: unknown[] }>
  >(function MockSnackbarHost(props, ref) {
    react.useImperativeHandle(ref, () => ({
      showSnackbar: jest.fn(async () => "actionPerformed"),
    }));
    return (
      <AnyView modifiers={props.modifiers} testID="compose-snackbar-host" />
    );
  });
  return { SnackbarHost };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  testID: (id: string) => ({ $type: "testID", id }),
}));

function loadAndroidSnackbarHost() {
  return jest.requireActual<{
    AndroidSnackbarHost: ComponentType<
      AndroidSnackbarHostProps & { ref?: Ref<MockSnackbarHostRef> }
    >;
  }>("../../../src/shared/ui/snackbar-host.android.tsx").AndroidSnackbarHost;
}

describe("AndroidSnackbarHost", () => {
  test("forwards the ref so the caller can imperatively show a snackbar and read its result", async () => {
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const ref = createRef<MockSnackbarHostRef>();
    const screen = await render(
      <AndroidSnackbarHost ref={ref} testID="group-list-snackbar" />,
    );
    expect(screen.getByTestId("group-list-snackbar")).toBeTruthy();
    let result: string | undefined;
    await act(async () => {
      result = await ref.current?.showSnackbar({
        actionLabel: "다시 시도",
        message: "불러오지 못했어요",
      });
    });
    expect(result).toBe("actionPerformed");
  });

  test("passes a testID modifier to the underlying SnackbarHost when given", async () => {
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const screen = await render(
      <AndroidSnackbarHost testID="group-list-snackbar" />,
    );
    expect(screen.getByTestId("compose-snackbar-host").props.modifiers).toEqual(
      [{ $type: "testID", id: "group-list-snackbar-host" }],
    );
  });

  test("omits the modifier entirely without a testID", async () => {
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const screen = await render(<AndroidSnackbarHost />);
    expect(
      screen.getByTestId("compose-snackbar-host").props.modifiers,
    ).toBeUndefined();
  });
});
