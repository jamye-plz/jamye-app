import { createRealtimeSocket } from "@/features/sync/realtime/realtime-socket";

class NativeSocket {
  static readonly OPEN = 1;
  static instances: NativeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(readonly url: string) {
    NativeSocket.instances.push(this);
  }
}

describe("realtime native socket boundary", () => {
  const original = globalThis.WebSocket;

  beforeEach(() => {
    NativeSocket.instances = [];
    globalThis.WebSocket = NativeSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = original;
  });

  function connect() {
    const handlers = {
      open: jest.fn(),
      message: jest.fn(),
      close: jest.fn(),
      error: jest.fn(),
    };
    const socket = createRealtimeSocket(
      "wss://example.test/api/v1/realtime/ws?ticket=one-time-test",
      handlers,
    );
    return { socket, handlers, native: NativeSocket.instances[0] };
  }

  it("forwards events without parsing or retaining credentials and payloads", () => {
    const { native, handlers } = connect();
    native.onopen?.();
    native.onmessage?.({ data: '{"type":"pong","nonce":"test"}' });
    native.onerror?.();
    native.onclose?.({ code: 4401 });
    expect(handlers.open).toHaveBeenCalledTimes(1);
    expect(handlers.message).toHaveBeenCalledWith(
      '{"type":"pong","nonce":"test"}',
    );
    expect(handlers.error).toHaveBeenCalledTimes(1);
    expect(handlers.close).toHaveBeenCalledWith(4401);
  });

  it("sends only while open and reports a native send failure without throwing", () => {
    const { socket, native, handlers } = connect();
    expect(socket.send("not-open")).toBe(false);
    expect(native.send).not.toHaveBeenCalled();
    native.readyState = NativeSocket.OPEN;
    expect(socket.send("frame")).toBe(true);
    expect(native.send).toHaveBeenCalledWith("frame");
    native.send.mockImplementationOnce(() => {
      throw new Error("native transport failure");
    });
    expect(socket.send("frame")).toBe(false);
    expect(handlers.error).toHaveBeenCalledTimes(1);
  });

  it("disposes idempotently and fences even already-queued native callbacks", () => {
    const { socket, native, handlers } = connect();
    const lateOpen = native.onopen;
    const lateMessage = native.onmessage;
    const lateError = native.onerror;
    const lateClose = native.onclose;
    socket.close(1000);
    socket.close(1000);
    lateOpen?.();
    lateMessage?.({ data: "late-private-message" });
    lateError?.();
    lateClose?.({ code: 4401 });
    native.readyState = NativeSocket.OPEN;
    expect(socket.send("late-frame")).toBe(false);
    expect(native.close).toHaveBeenCalledTimes(1);
    expect(native.close).toHaveBeenCalledWith(1000);
    expect(native.onopen).toBeNull();
    expect(native.onmessage).toBeNull();
    expect(native.onerror).toBeNull();
    expect(native.onclose).toBeNull();
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it("contains a native close failure after detaching the retired socket", () => {
    const { socket, native, handlers } = connect();
    const lateMessage = native.onmessage;
    native.close.mockImplementation(() => {
      throw new Error("native close failed");
    });
    expect(() => socket.close()).not.toThrow();
    lateMessage?.({ data: "retired" });
    expect(handlers.message).not.toHaveBeenCalled();
    expect(() => socket.close()).not.toThrow();
    expect(native.close).toHaveBeenCalledTimes(1);
  });
});
