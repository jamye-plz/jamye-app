export type RealtimeSocketHandlers = Readonly<{
  open: () => void;
  message: (data: unknown) => void;
  close: (code: number) => void;
  error: () => void;
}>;

export type RealtimeSocket = Readonly<{
  send: (frame: string) => boolean;
  close: (code?: number) => void;
}>;

export type RealtimeSocketFactory = (
  url: string,
  handlers: RealtimeSocketHandlers,
) => RealtimeSocket;

/** Native transport only; authentication, frame validation and retries are injected above it. */
export const createRealtimeSocket: RealtimeSocketFactory = (url, handlers) => {
  const socket = new WebSocket(url);
  let disposed = false;
  const detach = () => {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  };

  socket.onopen = () => {
    if (!disposed) handlers.open();
  };
  socket.onmessage = (event) => {
    if (!disposed) handlers.message(event.data);
  };
  socket.onerror = () => {
    if (!disposed) handlers.error();
  };
  socket.onclose = (event) => {
    if (disposed) return;
    disposed = true;
    detach();
    handlers.close(event.code);
  };

  return {
    send(frame) {
      if (disposed || socket.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(frame);
        return true;
      } catch {
        handlers.error();
        return false;
      }
    },
    close(code = 1000) {
      if (disposed) return;
      disposed = true;
      detach();
      try {
        socket.close(code);
      } catch {
        // A retired native handle cannot prevent account/session teardown.
      }
    },
  };
};
