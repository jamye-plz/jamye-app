import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  anySignal,
  composeAbortSignal,
  parseJsonResponseBody,
  withTimeoutSignal,
} from "@/core/http/http-client";

function pendingUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
}

describe("composeAbortSignal", () => {
  test("retains the first abort reason when the caller aborts after the deadline", () => {
    jest.useFakeTimers();
    const caller = new AbortController();
    const composed = composeAbortSignal(caller.signal, 5);
    jest.advanceTimersByTime(5);
    caller.abort();
    expect(composed.reason()).toBe("timeout");
    composed.cleanup();
    jest.useRealTimers();
  });
  test("aborts with reason 'timeout' when no caller signal fires first", () => {
    jest.useFakeTimers();
    const composed = composeAbortSignal(undefined, 1_000);
    expect(composed.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1_000);
    expect(composed.signal.aborted).toBe(true);
    expect(composed.reason()).toBe("timeout");
    composed.cleanup();
    jest.useRealTimers();
  });

  test("aborts with reason 'caller' when the caller signal fires before the timeout", () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const composed = composeAbortSignal(controller.signal, 1_000);
    controller.abort();
    expect(composed.signal.aborted).toBe(true);
    expect(composed.reason()).toBe("caller");
    jest.advanceTimersByTime(1_000);
    expect(composed.reason()).toBe("caller");
    composed.cleanup();
    jest.useRealTimers();
  });

  test("is immediately aborted with reason 'caller' when the caller signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const composed = composeAbortSignal(controller.signal, 1_000);
    expect(composed.signal.aborted).toBe(true);
    expect(composed.reason()).toBe("caller");
    composed.cleanup();
  });

  test("cleanup stops the timer from firing later", () => {
    jest.useFakeTimers();
    const composed = composeAbortSignal(undefined, 1_000);
    composed.cleanup();
    jest.advanceTimersByTime(1_000);
    expect(composed.signal.aborted).toBe(false);
    jest.useRealTimers();
  });

  test("cleanup detaches the caller-abort listener so a later abort is a no-op", () => {
    const controller = new AbortController();
    const composed = composeAbortSignal(controller.signal, 1_000);
    composed.cleanup();
    controller.abort();
    expect(composed.reason()).toBeNull();
  });
});

describe("anySignal", () => {
  test("reuses a lone signal rather than retaining one listener for every request", () => {
    const controller = new AbortController();
    expect(anySignal([controller.signal, undefined])).toBe(controller.signal);
  });
  test("detaches both input listeners when either input aborts", () => {
    const first = new AbortController();
    const second = new AbortController();
    const removeFirst = jest.spyOn(first.signal, "removeEventListener");
    const removeSecond = jest.spyOn(second.signal, "removeEventListener");
    anySignal([first.signal, second.signal]);
    first.abort();
    expect(removeFirst).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeSecond).toHaveBeenCalledWith("abort", expect.any(Function));
  });
  test("aborts once any one of the input signals aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = anySignal([a.signal, b.signal]);
    expect(combined.aborted).toBe(false);
    b.abort();
    expect(combined.aborted).toBe(true);
  });

  test("is already aborted when one input is already aborted", () => {
    const a = new AbortController();
    a.abort();
    const combined = anySignal([a.signal, undefined]);
    expect(combined.aborted).toBe(true);
  });

  test("ignores undefined entries and never aborts if none of the signals do", () => {
    const a = new AbortController();
    const combined = anySignal([undefined, a.signal]);
    expect(combined.aborted).toBe(false);
  });
});

describe("parseJsonResponseBody", () => {
  test("never calls .json() on a 204 No Content response (G6/G7/G8)", async () => {
    const json = jest.fn(async () => ({ unexpected: true }));
    const response = { status: 204, json } as unknown as Response;
    await expect(parseJsonResponseBody(response)).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  test("returns the parsed JSON body for a non-204 response", async () => {
    const response = {
      status: 200,
      json: async () => ({ ok: true }),
    } as unknown as Response;
    await expect(parseJsonResponseBody(response)).resolves.toEqual({
      ok: true,
    });
  });

  test("treats a malformed non-204 body as null rather than throwing", async () => {
    const response = {
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as unknown as Response;
    await expect(parseJsonResponseBody(response)).resolves.toBeNull();
  });

  test("propagates a genuine AbortError while reading the body instead of swallowing it", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const response = {
      status: 200,
      json: async () => {
        throw abortError;
      },
    } as unknown as Response;
    await expect(parseJsonResponseBody(response)).rejects.toBe(abortError);
  });
});

describe("withTimeoutSignal", () => {
  test("does not dispatch work whose caller has already cancelled", async () => {
    const caller = new AbortController();
    caller.abort();
    const run = jest.fn(async () => "not-dispatched");
    await expect(
      withTimeoutSignal(caller.signal, 15_000, run),
    ).rejects.toMatchObject({ by: "caller" });
    expect(run).not.toHaveBeenCalled();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("returns the run() result on success", async () => {
    await expect(
      withTimeoutSignal(undefined, REQUEST_TIMEOUT_MS, async () => "ok"),
    ).resolves.toBe("ok");
  });

  test("throws HttpAbortedError('timeout') when run() outlives the deadline", async () => {
    jest.useFakeTimers();
    const pending = withTimeoutSignal(undefined, 5, pendingUntilAbort);
    const assertion = expect(pending).rejects.toBeInstanceOf(HttpAbortedError);
    jest.advanceTimersByTime(5);
    await assertion;
    await pending.catch((error: HttpAbortedError) => {
      expect(error.by).toBe("timeout");
    });
  });

  test("throws HttpAbortedError('caller') when the caller signal aborts first", async () => {
    const controller = new AbortController();
    const pending = withTimeoutSignal(
      controller.signal,
      REQUEST_TIMEOUT_MS,
      pendingUntilAbort,
    );
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(HttpAbortedError);
    await pending.catch((error: HttpAbortedError) => {
      expect(error.by).toBe("caller");
    });
  });

  test("propagates non-abort failures from run() unchanged", async () => {
    const failure = new Error("dns failure");
    await expect(
      withTimeoutSignal(undefined, REQUEST_TIMEOUT_MS, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  test("stays live across multiple awaited steps inside run()", async () => {
    jest.useFakeTimers();
    const pending = withTimeoutSignal(undefined, 5, async (signal) => {
      await Promise.resolve();
      return pendingUntilAbort(signal);
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(HttpAbortedError);
    await Promise.resolve();
    jest.advanceTimersByTime(5);
    await assertion;
  });
});
