import { createInstallationIdStore } from "@/features/notifications/platform/installation-id-store";

// jest-expo's expo-crypto mock returns undefined from randomUUID; the store's
// default generator must produce a real v4 id here, so back it with Node's.
jest.mock("expo-crypto", () => ({
  randomUUID: () =>
    (
      jest.requireActual("node:crypto") as { randomUUID: () => string }
    ).randomUUID(),
}));

function createFakeSecureStore(initial: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("installation-id-store", () => {
  it("generates a UUID v4 and persists it on first call", async () => {
    const storage = createFakeSecureStore();
    const store = createInstallationIdStore(storage);
    const id = await store.getOrCreate();
    expect(id).toMatch(UUID_V4_PATTERN);
    expect(id.length).toBeLessThanOrEqual(255);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it("returns the same id across repeated calls on one store instance", async () => {
    const storage = createFakeSecureStore();
    const store = createInstallationIdStore(storage);
    const first = await store.getOrCreate();
    const second = await store.getOrCreate();
    expect(second).toBe(first);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls to a single generation", async () => {
    const storage = createFakeSecureStore();
    const store = createInstallationIdStore(storage);
    const [a, b] = await Promise.all([
      store.getOrCreate(),
      store.getOrCreate(),
    ]);
    expect(a).toBe(b);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing persisted id across a simulated app restart, never regenerating", async () => {
    const storage = createFakeSecureStore();
    const firstStore = createInstallationIdStore(storage);
    const id = await firstStore.getOrCreate();

    const restartedStore = createInstallationIdStore(storage);
    const idAfterRestart = await restartedStore.getOrCreate();

    expect(idAfterRestart).toBe(id);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it("uses an injected id generator instead of a real UUID when provided", async () => {
    const storage = createFakeSecureStore();
    const generateId = jest.fn(() => "fixed-test-id");
    const store = createInstallationIdStore(storage, generateId);
    await expect(store.getOrCreate()).resolves.toBe("fixed-test-id");
    expect(generateId).toHaveBeenCalledTimes(1);
  });

  it("ignores a corrupted persisted value (empty string) and regenerates", async () => {
    const storage = createFakeSecureStore({
      "jamye.push.installation-id.v1": "",
    });
    const store = createInstallationIdStore(storage);
    const id = await store.getOrCreate();
    expect(id).toMatch(UUID_V4_PATTERN);
  });

  it("rejects the caller once on a storage failure and retries fresh on the next call", async () => {
    const storage = createFakeSecureStore();
    storage.setItemAsync.mockRejectedValueOnce(
      new Error("keychain unavailable"),
    );
    const store = createInstallationIdStore(storage);

    await expect(store.getOrCreate()).rejects.toThrow("keychain unavailable");

    // The failed attempt must not stay pinned as the shared in-flight promise.
    const id = await store.getOrCreate();
    expect(id).toMatch(UUID_V4_PATTERN);
    expect(storage.setItemAsync).toHaveBeenCalledTimes(2);
  });
});
