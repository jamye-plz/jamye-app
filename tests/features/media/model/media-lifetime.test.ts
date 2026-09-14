import { createMediaLifetime } from "@/features/media/model/media-runtime";

test("background invalidates first, cancels listeners and never authorizes a new background operation", () => {
  const lifetime = createMediaLifetime(true);
  const initial = lifetime.captureGeneration();
  const observations: boolean[] = [];
  lifetime.subscribeInvalidation(() =>
    observations.push(lifetime.isCurrent(lifetime.captureGeneration())),
  );
  expect(lifetime.isCurrent(initial)).toBe(true);
  lifetime.setForeground(false);
  expect(lifetime.isCurrent(initial)).toBe(false);
  expect(observations).toEqual([false]);
  lifetime.setForeground(true);
  expect(lifetime.isCurrent(initial)).toBe(false);
  expect(lifetime.isCurrent(lifetime.captureGeneration())).toBe(true);
  expect(observations).toEqual([false, true]);
});
test("a disposed account never becomes current again, even after foreground", () => {
  const lifetime = createMediaLifetime(true);
  const notify = jest.fn();
  const unsubscribe = lifetime.subscribeInvalidation(notify);
  unsubscribe();
  lifetime.dispose();
  lifetime.setForeground(true);
  expect(notify).not.toHaveBeenCalled();
  expect(lifetime.isCurrent(lifetime.captureGeneration())).toBe(false);
});
