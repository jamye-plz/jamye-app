import { renderHook } from "@testing-library/react-native";
import { BackHandler } from "react-native";

import { useCloseEditOnBack } from "@/features/topics/ui/use-close-edit-on-back.android";

describe("useCloseEditOnBack (Android)", () => {
  type BackPressHandler = Parameters<typeof BackHandler.addEventListener>[1];
  let handlers: BackPressHandler[];
  let remove: jest.Mock;

  beforeEach(() => {
    handlers = [];
    remove = jest.fn();
    jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_event, handler) => {
        handlers.push(handler);
        return { remove };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("while editing, system back closes the edit screen and is consumed", async () => {
    const onBack = jest.fn();
    await renderHook(() => useCloseEditOnBack(true, onBack));
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!({} as Parameters<BackPressHandler>[0])).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("outside edit mode it does not intercept back", async () => {
    await renderHook(() => useCloseEditOnBack(false, jest.fn()));
    expect(handlers).toHaveLength(0);
  });

  test("leaving edit mode removes the listener", async () => {
    const onBack = jest.fn();
    const hook = await renderHook(
      ({ active }: { active: boolean }) => useCloseEditOnBack(active, onBack),
      { initialProps: { active: true } },
    );
    await hook.rerender({ active: false });
    expect(remove).toHaveBeenCalled();
  });
});
