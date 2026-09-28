import { act, renderHook } from "@testing-library/react-native";
import * as ExpoAudio from "expo-audio";

// `__set*`/`__resetExpoAudioMock` are test-only helpers the manual mock adds
// on top of `expo-audio`'s real public surface (see
// `tests/__mocks__/expo-audio.ts`'s docstring) -- `tsc` checks this file's
// imports against the *real* package's `.d.ts` (jest's manual-mock
// resolution is a runtime-only concern), so importing them as if they were
// part of "expo-audio" itself does not type-check. Importing the module
// normally (the same instance `recorder.ios.ts`/`recorder.android.ts`
// resolve via their own `expo-audio` import) and casting locally to the
// mock's real shape keeps this connected to that one instance.
const {
  __resetExpoAudioMock,
  __setRecorder,
  __setRecorderState,
  __setRecordingPermissionResponse,
} = ExpoAudio as unknown as typeof import("../../../__mocks__/expo-audio");

const mockDelete = jest.fn();
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      mockDelete(this.uri);
    }
  },
}));

type RecorderModule = typeof import("@/features/media/platform/recorder.ios");

describe.each(["ios", "android"] as const)(
  "V1/E2 voice recorder platform wrapper (%s)",
  (platform) => {
    const modulePath =
      platform === "ios"
        ? "../../../../src/features/media/platform/recorder.ios"
        : "../../../../src/features/media/platform/recorder.android";

    function load(): RecorderModule {
      return jest.requireActual<RecorderModule>(modulePath);
    }

    beforeEach(() => {
      __resetExpoAudioMock();
      mockDelete.mockClear();
    });

    test("requestPermission surfaces a denial, start/stop returns the audio/mp4 uri+duration, stop-before-start and cancel both leave nothing to stop", async () => {
      const { useVoiceRecorder } = load();
      __setRecordingPermissionResponse({ granted: false, canAskAgain: false });
      // expo-audio's mock replaces its module-level `recorder`/`recorderState`
      // objects wholesale on `__set*` (unlike the real native module, which
      // mutates the SAME recorder in place), and this hook's `useCallback`s
      // close over whatever `useAudioRecorder()` returned at the last render.
      // Setting the take's uri/duration before the first render keeps this
      // test independent of a rerender.
      __setRecorder({ uri: "file:///cache/voice.m4a" });
      __setRecorderState({ durationMillis: 4200 });
      const { result, unmount } = await renderHook(() => useVoiceRecorder());

      let denied;
      await act(async () => {
        denied = await result.current.requestPermission();
      });
      expect(denied).toEqual({ granted: false, canAskAgain: false });

      let beforeStart;
      await act(async () => {
        beforeStart = await result.current.stop();
      });
      expect(beforeStart).toBeNull();

      await act(async () => {
        await result.current.start();
      });
      let stopped;
      await act(async () => {
        stopped = await result.current.stop();
      });
      expect(stopped).toEqual({
        uri: "file:///cache/voice.m4a",
        contentType: "audio/mp4",
        durationMs: 4200,
      });

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        result.current.cancel();
      });
      expect(mockDelete).toHaveBeenCalledWith("file:///cache/voice.m4a");
      let afterCancel;
      await act(async () => {
        afterCancel = await result.current.stop();
      });
      expect(afterCancel).toBeNull();

      await unmount();
    });

    test("cancel after the recorder was released (leaving the room mid-recording) never throws (device regression: released shared object)", async () => {
      const { useVoiceRecorder } = load();
      // A released native object throws synchronously on any call. Set before
      // the first render: the hook's callbacks close over this recorder.
      __setRecorder({
        stop: jest.fn(() => {
          throw new Error("Cannot use shared object that was already released");
        }),
      });
      const { result, unmount } = await renderHook(() => useVoiceRecorder());
      await act(async () => {
        await result.current.start();
      });
      expect(() => result.current.cancel()).not.toThrow();
      await unmount();
    });
  },
);
