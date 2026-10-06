import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import {
  IMAGE_FADE_MS,
  useImageFadeTransition,
  useReduceMotionEnabled,
} from "@/shared/platform/use-reduce-motion-enabled";

type ReduceMotionListener = (enabled: boolean) => void;

/**
 * Drives `AccessibilityInfo` the way the system does: an async initial query
 * plus a `reduceMotionChanged` subscription the test can fire. Uses
 * `jest.spyOn` (restored in `afterEach`) so the jest-expo preset's own
 * default implementations come back for the other suites' hooks.
 */
function mockReduceMotion(initial: boolean | Promise<boolean>) {
  const remove = jest.fn();
  let listener: ReduceMotionListener | undefined;
  // The jest-expo preset already installs `jest.fn()`s on these statics, so
  // `spyOn` returns the shared mock: clear its call history explicitly.
  const query = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockClear()
    .mockImplementation(() => Promise.resolve(initial));
  const subscribe = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockClear();
  subscribe.mockImplementation(((
    _eventName: string,
    handler: ReduceMotionListener,
  ) => {
    listener = handler;
    return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  return {
    query,
    remove,
    subscribe,
    emit: async (enabled: boolean) => {
      await act(async () => {
        listener?.(enabled);
      });
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useReduceMotionEnabled (A11YM-AC1/AC2)", () => {
  test("starts false (always animated) and reflects the system setting once the async query resolves", async () => {
    let resolveQuery!: (value: boolean) => void;
    mockReduceMotion(
      new Promise<boolean>((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const { result } = await renderHook(() => useReduceMotionEnabled());
    expect(result.current).toBe(false);
    await act(async () => {
      resolveQuery(true);
    });
    expect(result.current).toBe(true);
  });

  test("stays false when the system setting is off", async () => {
    mockReduceMotion(false);
    const { result } = await renderHook(() => useReduceMotionEnabled());
    await flush();
    expect(result.current).toBe(false);
  });

  test("keeps the always-animated default when the query rejects", async () => {
    mockReduceMotion(false).query.mockRejectedValue(new Error("native"));
    const { result } = await renderHook(() => useReduceMotionEnabled());
    await flush();
    expect(result.current).toBe(false);
  });

  test("follows a mid-session reduceMotionChanged toggle in both directions", async () => {
    const { emit, subscribe } = mockReduceMotion(false);
    const { result } = await renderHook(() => useReduceMotionEnabled());
    await flush();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0]?.[0]).toBe("reduceMotionChanged");

    await emit(true);
    expect(result.current).toBe(true);
    await emit(false);
    expect(result.current).toBe(false);
  });

  test("removes its subscription on unmount", async () => {
    const { remove } = mockReduceMotion(false);
    const { unmount } = await renderHook(() => useReduceMotionEnabled());
    await flush();
    expect(remove).not.toHaveBeenCalled();
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("useImageFadeTransition (A11YM-AC2)", () => {
  test("the fade lasts 150ms", () => {
    expect(IMAGE_FADE_MS).toBe(150);
  });

  test("fades for IMAGE_FADE_MS while the system reduce-motion setting is off", async () => {
    mockReduceMotion(false);
    const { result } = await renderHook(() => useImageFadeTransition());
    await flush();
    expect(result.current).toBe(150);
  });

  test("returns null (no fade) once the system reduce-motion setting is on", async () => {
    mockReduceMotion(true);
    const { result } = await renderHook(() => useImageFadeTransition());
    await flush();
    expect(result.current).toBeNull();
  });

  test("starts at the animated default, then follows a mid-session toggle both ways", async () => {
    let resolveQuery!: (value: boolean) => void;
    const { emit } = mockReduceMotion(
      new Promise<boolean>((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const { result } = await renderHook(() => useImageFadeTransition());
    expect(result.current).toBe(IMAGE_FADE_MS);
    await act(async () => {
      resolveQuery(false);
    });
    expect(result.current).toBe(IMAGE_FADE_MS);

    await emit(true);
    expect(result.current).toBeNull();
    await emit(false);
    expect(result.current).toBe(IMAGE_FADE_MS);
  });
});
