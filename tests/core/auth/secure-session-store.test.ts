import { createSecureSessionStore } from "@/core/auth/secure-session-store";

const pair = {
  accessToken: "access",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshToken: "r".repeat(43),
  refreshTokenExpiresAt: "2031-01-01T00:00:00Z",
};

describe("origin-bound secure session storage", () => {
  const mockGetItemAsync = jest.fn();
  const mockSetItemAsync = jest.fn();
  const mockDeleteItemAsync = jest.fn();
  const store = createSecureSessionStore({
    getItemAsync: mockGetItemAsync,
    setItemAsync: mockSetItemAsync,
    deleteItemAsync: mockDeleteItemAsync,
  });
  test("persists only an origin envelope and restores only the same origin", async () => {
    await store.save("https://api.example", pair);
    expect(JSON.parse(mockSetItemAsync.mock.calls[0][1])).toEqual({
      origin: "https://api.example",
      tokens: pair,
    });
    mockGetItemAsync.mockResolvedValue(
      JSON.stringify({ origin: "https://other.example", tokens: pair }),
    );
    await expect(store.load("https://api.example")).resolves.toBeNull();
    expect(mockDeleteItemAsync).toHaveBeenCalled();
  });
  test("clears malformed storage and exposes native storage errors", async () => {
    mockGetItemAsync.mockResolvedValue("not-json");
    await expect(store.load("https://api.example")).resolves.toBeNull();
    mockDeleteItemAsync.mockRejectedValueOnce(new Error("locked"));
    await expect(store.clear()).rejects.toThrow("locked");
  });
  test("returns empty and valid records but rejects every incomplete credential envelope", async () => {
    mockGetItemAsync.mockResolvedValueOnce(null);
    await expect(store.load("https://api.example")).resolves.toBeNull();
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({ origin: "https://api.example", tokens: pair }),
    );
    await expect(store.load("https://api.example")).resolves.toEqual(pair);
    for (const tokens of [null, {}, { ...pair, accessToken: "" }]) {
      mockGetItemAsync.mockResolvedValueOnce(
        JSON.stringify({ origin: "https://api.example", tokens }),
      );
      await expect(store.load("https://api.example")).resolves.toBeNull();
    }
  });
});
