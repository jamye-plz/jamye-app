import { enqueueVideoThumbnail } from "@/features/media/model/video-thumbnail-queue";

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("enqueueVideoThumbnail (device regression: one native step that never settled left every later thumbnail loading)", () => {
  test("runs jobs one at a time, in order", async () => {
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = enqueueVideoThumbnail(new AbortController().signal, () => {
      order.push("first");
      return new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    const second = enqueueVideoThumbnail(
      new AbortController().signal,
      async () => {
        order.push("second");
      },
    );
    await flush();
    expect(order).toEqual(["first"]);
    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  test("a running job that never settles releases the queue once its signal aborts", async () => {
    const hung = new AbortController();
    void enqueueVideoThumbnail(hung.signal, () => new Promise<never>(() => {}));
    const next = jest.fn(async () => "thumbnail");
    const result = enqueueVideoThumbnail(new AbortController().signal, next);
    await flush();
    expect(next).not.toHaveBeenCalled();

    hung.abort();
    await expect(result).resolves.toBe("thumbnail");
  });

  test("an aborted job still waiting its turn never lets later jobs skip the running one", async () => {
    const order: string[] = [];
    let finishRunning!: () => void;
    void enqueueVideoThumbnail(new AbortController().signal, () => {
      order.push("running");
      return new Promise<void>((resolve) => {
        finishRunning = resolve;
      });
    });
    const queued = new AbortController();
    const cancelled = enqueueVideoThumbnail(queued.signal, async () => {
      order.push("cancelled");
    });
    const later = enqueueVideoThumbnail(
      new AbortController().signal,
      async () => {
        order.push("later");
      },
    );
    queued.abort();
    await flush();
    expect(order).toEqual(["running"]);

    finishRunning();
    await expect(cancelled).rejects.toThrow("thumbnail_cancelled");
    await later;
    expect(order).toEqual(["running", "later"]);
  });
});
