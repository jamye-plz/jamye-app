import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { MediaImageViewer } from "@/features/media/ui/media-image-viewer";
import {
  clampImageOffset,
  clampImageZoom,
} from "@/features/media/model/media-image-zoom";

type GestureEvent = {
  scale: number;
  translationX: number;
  translationY: number;
};
type Handlers = {
  start?: () => void;
  update?: (event: GestureEvent) => void;
  end?: (event: GestureEvent, success: boolean) => void;
};
const mockGestures: Record<string, Handlers> = {};
const mockShared: { get: () => number; set: (next: number) => void }[] = [];
jest.mock("@/core/theme/theme-provider", () => ({
  useAppTheme: () => ({
    colors: { background: "#111", primary: "#eee", text: "#fff" },
  }),
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock("react-native-gesture-handler", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const gesture = (name: string) => {
    const handlers: Handlers = {};
    mockGestures[name] = handlers;
    const chain = {
      onStart: (callback: () => void) => {
        handlers.start = callback;
        return chain;
      },
      onUpdate: (callback: (event: GestureEvent) => void) => {
        handlers.update = callback;
        return chain;
      },
      onEnd: (callback: (event: GestureEvent, success: boolean) => void) => {
        handlers.end = callback;
        return chain;
      },
      numberOfTaps: () => chain,
      averageTouches: () => chain,
    };
    return chain;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: View,
    Gesture: {
      Pinch: () => gesture("pinch"),
      Pan: () => gesture("pan"),
      Tap: () => gesture("tap"),
      Simultaneous: () => ({}),
    },
  };
});
jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Image } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { Image },
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: number) => {
      const ref = React.useRef<{
        get: () => number;
        set: (next: number) => void;
      } | null>(null);
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get: () => value,
          set: (next) => {
            value = next;
          },
        };
        mockShared.push(ref.current);
      }
      return ref.current;
    },
  };
});
beforeEach(() => {
  mockShared.length = 0;
});

test("photo detail contains the local image and close, fit and accessible zoom controls", async () => {
  const onClose = jest.fn();
  const onError = jest.fn();
  const screen = await render(
    <MediaImageViewer
      uri="file:///owned/image.jpg"
      label="사진.jpg"
      onClose={onClose}
      onError={onError}
    />,
  );
  const image = screen.getByRole("image", { name: "사진.jpg 상세 이미지" });
  expect(image.props.source).toEqual({ uri: "file:///owned/image.jpg" });
  expect(image.props.resizeMode).toBe("contain");
  await fireEvent.press(screen.getByRole("button", { name: "사진 확대" }));
  expect(mockShared[0].get()).toBe(2);
  await fireEvent.press(screen.getByRole("button", { name: "사진 축소" }));
  expect(mockShared[0].get()).toBe(1);
  await fireEvent.press(screen.getByRole("button", { name: "사진 확대" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "사진 화면에 맞춤" }),
  );
  expect(mockShared[0].get()).toBe(1);
  await fireEvent(image, "error");
  expect(onError).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "사진 닫기" }));
  await fireEvent(screen.getByTestId("media-viewer-modal"), "requestClose");
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("pinch and double tap clamp zoom; pan cannot move a fitted image off screen", async () => {
  const screen = await render(
    <MediaImageViewer
      uri="file:///owned/image.jpg"
      label="사진"
      onClose={jest.fn()}
      onError={jest.fn()}
    />,
  );
  const event = { scale: 10, translationX: 900, translationY: -900 };
  await act(() => {
    mockGestures.pinch.start?.();
    mockGestures.pinch.update?.(event);
  });
  expect(mockShared[0].get()).toBe(4);
  await act(() => {
    mockGestures.pan.start?.();
    mockGestures.pan.update?.(event);
  });
  expect(Math.abs(mockShared[2].get())).toBe(0);
  await act(() => mockGestures.tap.end?.(event, false));
  expect(mockShared[0].get()).toBe(4);
  await act(() => mockGestures.tap.end?.(event, true));
  expect(mockShared[0].get()).toBe(1);
  await act(() => mockGestures.tap.end?.(event, true));
  expect(mockShared[0].get()).toBe(2);
  await screen.rerender(
    <MediaImageViewer
      uri="file:///owned/other.jpg"
      label="다른 사진"
      onClose={jest.fn()}
      onError={jest.fn()}
    />,
  );
  expect(mockShared[0].get()).toBe(1);
});

test("panning stays inside the measured viewport and rotation resets to fit", async () => {
  const screen = await render(
    <MediaImageViewer
      uri="file:///owned/image.jpg"
      label="사진"
      onClose={jest.fn()}
      onError={jest.fn()}
    />,
  );
  const image = screen.getByRole("image");
  await fireEvent(image, "layout", {
    nativeEvent: { layout: { width: 200, height: 300, x: 0, y: 0 } },
  });
  const event = { scale: 2, translationX: 500, translationY: -700 };
  await act(() => {
    mockGestures.pinch.start?.();
    mockGestures.pinch.update?.(event);
    mockGestures.pan.start?.();
    mockGestures.pan.update?.(event);
  });
  expect(mockShared[0].get()).toBe(2);
  expect(mockShared[2].get()).toBe(100);
  expect(mockShared[3].get()).toBe(-150);
  await fireEvent(image, "layout", {
    nativeEvent: { layout: { width: 300, height: 200, x: 0, y: 0 } },
  });
  expect(mockShared[0].get()).toBe(1);
  expect(mockShared[2].get()).toBe(0);
  expect(mockShared[3].get()).toBe(0);
});

test("zoom math clamps invalid/boundary inputs and symmetric translation limits", () => {
  expect([0, 1, 2, 8, NaN, Infinity].map(clampImageZoom)).toEqual([
    1, 1, 2, 4, 1, 1,
  ]);
  expect(clampImageOffset(500, 300, 2)).toBe(150);
  expect(clampImageOffset(-500, 300, 2)).toBe(-150);
  expect(clampImageOffset(20, 300, 1)).toBe(0);
  expect(clampImageOffset(NaN, 300, 2)).toBe(0);
});
