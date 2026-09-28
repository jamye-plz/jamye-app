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

// Each shown Snackbar stays up until the test resolves it (the Compose
// host resolves when the Snackbar is dismissed or its action is tapped).
const mockSnackbarResolvers: ((result: string) => void)[] = [];
// Lets a test hold the native host's first content layout back.
let mockHoldContentLayout = false;
let mockReportContentLayout: (() => void) | null = null;

jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const mockReact = jest.requireActual<typeof import("react")>("react");
  function Host(
    props: Readonly<{
      children?: ReactNode;
      onLayoutContent?: (event: unknown) => void;
      pointerEvents?: string;
      style?: unknown;
      testID?: string;
    }>,
  ) {
    // The native host reports its first content layout after mounting; the
    // snackbar host waits for it before calling into Compose.
    const { onLayoutContent } = props;
    mockReact.useEffect(() => {
      if (mockHoldContentLayout) {
        mockReportContentLayout = () =>
          onLayoutContent?.({ nativeEvent: { height: 0, width: 0 } });
        return;
      }
      onLayoutContent?.({ nativeEvent: { height: 0, width: 0 } });
    }, [onLayoutContent]);
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
      showSnackbar: jest.fn(
        () =>
          new Promise<string>((resolve) => {
            mockSnackbarResolvers.push(resolve);
          }),
      ),
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
  beforeEach(() => {
    mockSnackbarResolvers.length = 0;
    mockHoldContentLayout = false;
    mockReportContentLayout = null;
  });

  test("calls into Compose only after the host's content has laid out", async () => {
    // On device an immediate call was rejected: "Call to function
    // 'SnackbarHostView.showSnackbar' has been rejected".
    mockHoldContentLayout = true;
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const ref = createRef<MockSnackbarHostRef>();
    await render(<AndroidSnackbarHost ref={ref} />);
    await act(async () => {
      void ref.current?.showSnackbar({ message: "불러오지 못했어요" });
    });
    expect(mockSnackbarResolvers).toHaveLength(0);
    await act(async () => {
      mockReportContentLayout?.();
    });
    expect(mockSnackbarResolvers).toHaveLength(1);
  });

  test("mounts no host until a snackbar is requested, and unmounts it once the snackbar resolves", async () => {
    // A permanently mounted host won React Native's hit test on device and
    // swallowed the touches of every Pressable underneath.
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const ref = createRef<MockSnackbarHostRef>();
    const screen = await render(
      <AndroidSnackbarHost ref={ref} testID="group-list-snackbar" />,
    );
    expect(screen.queryByTestId("group-list-snackbar")).toBeNull();

    let result: Promise<string> | undefined;
    await act(async () => {
      result = ref.current?.showSnackbar({
        actionLabel: "다시 시도",
        message: "불러오지 못했어요",
      });
    });
    expect(screen.getByTestId("group-list-snackbar")).toBeTruthy();

    await act(async () => {
      mockSnackbarResolvers[0]!("actionPerformed");
      await result;
    });
    await expect(result).resolves.toBe("actionPerformed");
    expect(screen.queryByTestId("group-list-snackbar")).toBeNull();
  });

  test("passes a testID modifier to the underlying SnackbarHost when given", async () => {
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const ref = createRef<MockSnackbarHostRef>();
    const screen = await render(
      <AndroidSnackbarHost ref={ref} testID="group-list-snackbar" />,
    );
    await act(async () => {
      void ref.current?.showSnackbar({ message: "불러오지 못했어요" });
    });
    expect(screen.getByTestId("compose-snackbar-host").props.modifiers).toEqual(
      [{ $type: "testID", id: "group-list-snackbar-host" }],
    );
  });

  test("omits the modifier entirely without a testID", async () => {
    const AndroidSnackbarHost = loadAndroidSnackbarHost();
    const ref = createRef<MockSnackbarHostRef>();
    const screen = await render(<AndroidSnackbarHost ref={ref} />);
    await act(async () => {
      void ref.current?.showSnackbar({ message: "불러오지 못했어요" });
    });
    expect(
      screen.getByTestId("compose-snackbar-host").props.modifiers,
    ).toBeUndefined();
  });
});
