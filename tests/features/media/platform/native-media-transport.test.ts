import { createNativeMediaHttpTransport } from "@/features/media/platform/native-media-transport";

const mockExpoFetch = jest.fn();

jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockExpoFetch(...args),
}));

describe("M11 native media transport (expo/fetch adapter)", () => {
  beforeEach(() => {
    mockExpoFetch.mockReset();
  });

  test("forwards method/headers/body/credentials/redirect/signal verbatim to expo/fetch", async () => {
    mockExpoFetch.mockResolvedValue({
      status: 201,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ ok: true }),
    });
    const transport = createNativeMediaHttpTransport();
    const signal = new AbortController().signal;
    await transport.fetch("https://media.example/api/v1/media/uploads", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: '{"a":1}',
      credentials: "omit",
      redirect: "error",
      signal,
    });
    expect(mockExpoFetch).toHaveBeenCalledWith(
      "https://media.example/api/v1/media/uploads",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: '{"a":1}',
        credentials: "omit",
        redirect: "error",
        signal,
      },
    );
  });

  test("wraps the response status/ok/headers.get/json without altering values", async () => {
    const headerValue = "https://media.example/objects/signed?x=1&y=2";
    mockExpoFetch.mockResolvedValue({
      status: 307,
      ok: false,
      headers: {
        get: (name: string) => (name === "location" ? headerValue : null),
      },
      json: async () => {
        throw new Error("must not be called for a 307");
      },
    });
    const transport = createNativeMediaHttpTransport();
    const response = await transport.fetch("https://api.example/x", {
      method: "GET",
      headers: {},
      credentials: "omit",
      redirect: "manual",
    });
    expect(response.status).toBe(307);
    expect(response.ok).toBe(false);
    expect(response.headers.get("location")).toBe(headerValue);
  });
});
