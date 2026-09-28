import {
  registerActivePlayback,
  resetAudioPlaybackCoordinatorForTests,
  stopActivePlayback,
} from "@/features/media/model/audio-playback-coordinator";

beforeEach(() => {
  resetAudioPlaybackCoordinatorForTests();
});

test("registering a second source stops the first (one-at-a-time)", () => {
  const stopFirst = jest.fn();
  const stopSecond = jest.fn();
  registerActivePlayback("voice-1", stopFirst);
  registerActivePlayback("voice-2", stopSecond);
  expect(stopFirst).toHaveBeenCalledTimes(1);
  expect(stopSecond).not.toHaveBeenCalled();
});

test("this also stops a currently-playing video (any other registered id)", () => {
  const stopVideo = jest.fn();
  const stopVoice = jest.fn();
  registerActivePlayback("video-message-1", stopVideo);
  registerActivePlayback("voice-message-1", stopVoice);
  expect(stopVideo).toHaveBeenCalledTimes(1);
  expect(stopVoice).not.toHaveBeenCalled();
});

test("re-registering the same id does not stop itself", () => {
  const stop = jest.fn();
  registerActivePlayback("voice-1", stop);
  registerActivePlayback("voice-1", stop);
  expect(stop).not.toHaveBeenCalled();
});

test("unregistering removes the source without calling stop", () => {
  const stop = jest.fn();
  const unregister = registerActivePlayback("voice-1", stop);
  unregister();
  stopActivePlayback();
  expect(stop).not.toHaveBeenCalled();
});

test("unregistering an already-evicted source is a no-op", () => {
  const stopFirst = jest.fn();
  const stopSecond = jest.fn();
  const unregisterFirst = registerActivePlayback("voice-1", stopFirst);
  registerActivePlayback("voice-2", stopSecond);
  // The first source's own cleanup runs after it was already evicted --
  // must not clear the second (now-active) source's registration.
  unregisterFirst();
  stopActivePlayback();
  expect(stopSecond).toHaveBeenCalledTimes(1);
});

test("stopActivePlayback with nothing registered does nothing", () => {
  expect(() => stopActivePlayback()).not.toThrow();
});
