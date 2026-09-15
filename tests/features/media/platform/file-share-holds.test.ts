import { createShareHoldRegistry } from "@/features/media/platform/file-share-holds";

function registry() {
  const removeCalls: string[] = [];
  const remove = jest.fn((uri: string) => {
    removeCalls.push(uri);
  });
  const instance = createShareHoldRegistry(remove);
  return { instance, remove, removeCalls };
}

test("releaseOrDefer removes immediately when the uri has no active hold", () => {
  const { instance, remove } = registry();
  instance.releaseOrDefer("file:///owned/a.bin");
  expect(remove).toHaveBeenCalledWith("file:///owned/a.bin");
});

test("retain marks a uri as held until its release callback runs", () => {
  const { instance } = registry();
  expect(instance.isHeld("file:///owned/a.bin")).toBe(false);
  const release = instance.retain("file:///owned/a.bin");
  expect(instance.isHeld("file:///owned/a.bin")).toBe(true);
  release();
  expect(instance.isHeld("file:///owned/a.bin")).toBe(false);
});

test("releaseOrDefer on a held uri defers removal until every hold is released", () => {
  const { instance, remove } = registry();
  const release = instance.retain("file:///owned/a.bin");
  instance.releaseOrDefer("file:///owned/a.bin");
  expect(remove).not.toHaveBeenCalled();
  release();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith("file:///owned/a.bin");
});

test("a uri retained twice is only removed once the second (matching) release runs", () => {
  const { instance, remove } = registry();
  const releaseFirst = instance.retain("file:///owned/a.bin");
  const releaseSecond = instance.retain("file:///owned/a.bin");
  instance.releaseOrDefer("file:///owned/a.bin");
  releaseFirst();
  expect(remove).not.toHaveBeenCalled();
  expect(instance.isHeld("file:///owned/a.bin")).toBe(true);
  releaseSecond();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("a release callback is idempotent: calling it again after the first call has no effect", () => {
  const { instance, remove } = registry();
  const releaseFirst = instance.retain("file:///owned/a.bin");
  const releaseSecond = instance.retain("file:///owned/a.bin");
  releaseFirst();
  releaseFirst();
  expect(instance.isHeld("file:///owned/a.bin")).toBe(true);
  releaseSecond();
  releaseSecond();
  expect(instance.isHeld("file:///owned/a.bin")).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});

test("hasAnyHeld reflects whether any uri in the registry currently has an active hold", () => {
  const { instance } = registry();
  expect(instance.hasAnyHeld()).toBe(false);
  const release = instance.retain("file:///owned/a.bin");
  expect(instance.hasAnyHeld()).toBe(true);
  release();
  expect(instance.hasAnyHeld()).toBe(false);
});

test("a removal deferred to release-time swallows a remove failure (best effort under races)", () => {
  const remove = jest.fn(() => {
    throw new Error("filesystem race");
  });
  const instance = createShareHoldRegistry(remove);
  const release = instance.retain("file:///owned/a.bin");
  instance.releaseOrDefer("file:///owned/a.bin");
  expect(() => release()).not.toThrow();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("releaseOrDefer's immediate removal path (uri not held) propagates a remove failure to its caller", () => {
  const remove = jest.fn(() => {
    throw new Error("filesystem race");
  });
  const instance = createShareHoldRegistry(remove);
  expect(() => instance.releaseOrDefer("file:///owned/a.bin")).toThrow(
    "filesystem race",
  );
});
