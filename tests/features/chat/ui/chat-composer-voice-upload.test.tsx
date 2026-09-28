import { act, renderHook } from "@testing-library/react-native";
import * as ExpoAudio from "expo-audio";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";

import {
  VOICE_PREPARE_FAILED_MESSAGE,
  VOICE_UPLOAD_FAILED_MESSAGE,
  useChatComposerRecorder,
} from "@/features/chat/ui/chat-composer-recorder";
import { useChatComposer } from "@/features/chat/ui/use-chat-composer";
import type {
  MediaAttachmentController,
  MediaAttachmentQueueItem,
} from "@/features/media/ui/media-attachment-types";

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
const mockStageOwnedCopy = jest.fn();
const mockRemoveStagedFile = jest.fn();
jest.mock("@/features/media/platform/media-staging", () => ({
  removeStagedFile: (...args: unknown[]) => mockRemoveStagedFile(...args),
  stageOwnedCopy: (...args: unknown[]) => mockStageOwnedCopy(...args),
}));
const mockShowNotice = jest.fn();
jest.mock("@/shared/ui/system-feedback", () => ({
  useOptionalSystemFeedback: () => ({ showNotice: mockShowNotice }),
}));

// The same instance the recorder wrappers import (see recorder.test.ts):
// `jest.requireMock` would hand back a separate copy of the manual mock.
const expoAudio =
  ExpoAudio as unknown as typeof import("../../../__mocks__/expo-audio");

const RECORDED = "file:///cache/Audio/recording-1.m4a";
const STAGED = "file:///cache/media-staging/voice.m4a";

function controller(
  items: readonly MediaAttachmentQueueItem[] = [],
): MediaAttachmentController {
  return {
    items,
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
  };
}

function recorderHook(attachmentController: MediaAttachmentController) {
  const callbacks = {
    onPermissionDenied: jest.fn(),
    onPrepareFailed: jest.fn(),
    onTooShort: jest.fn(),
  };
  return {
    callbacks,
    render: () =>
      renderHook(() =>
        useChatComposerRecorder({ attachmentController, ...callbacks }),
      ),
  };
}

/** Records a take of `ms` and stops it (the recorder reads the length first). */
async function recordTake(
  hook: { current: ReturnType<typeof useChatComposerRecorder> },
  ms = 4_200,
) {
  await act(() => hook.current.startRecording());
  expoAudio.__setRecorderState({ durationMillis: ms, isRecording: true });
  await act(() => hook.current.stopRecording());
}

// The app's foreground state, driven by each test.
let appState: AppStateStatus = "active";
let appStateListeners: ((state: AppStateStatus) => void)[] = [];
function setAppState(next: AppStateStatus) {
  appState = next;
  for (const listener of [...appStateListeners]) listener(next);
}

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  appState = "active";
  appStateListeners = [];
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => appState,
  });
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: AppStateStatus) => void);
      return {
        remove: () => {
          appStateListeners = appStateListeners.filter(
            (item) => item !== listener,
          );
        },
      } as ReturnType<typeof AppState.addEventListener>;
    });
  expoAudio.__resetExpoAudioMock();
  expoAudio.__setRecorder({ uri: RECORDED });
  mockStageOwnedCopy.mockReset();
  mockRemoveStagedFile.mockReset();
  mockShowNotice.mockReset();
});

describe("voice upload (device regression: every voice message stopped before its upload started)", () => {
  test("a stopped take is copied into app-owned staging and the staged copy is uploaded", async () => {
    mockStageOwnedCopy.mockResolvedValue({ uri: STAGED, byteSize: 2_048 });
    const attachments = controller();
    const { render } = recorderHook(attachments);
    const { result } = await render();

    await recordTake(result);

    expect(mockStageOwnedCopy).toHaveBeenCalledWith({
      sourceUri: RECORDED,
      suggestedName: expect.stringMatching(/^voice-\d+\.m4a$/),
    });
    expect(attachments.addAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        byteSize: 2_048,
        contentType: "audio/mp4",
        durationSeconds: 4.2,
        kind: "audio",
        scope: "chat",
        uri: STAGED,
      }),
    );
    expect(result.current.phase).toBe("preview");
  });

  test("a take stopped by backgrounding is uploaded once the app is active again (device regression: that preview could never be sent)", async () => {
    jest.useFakeTimers();
    try {
      mockStageOwnedCopy.mockResolvedValue({ uri: STAGED, byteSize: 2_048 });
      const attachments = controller();
      const callbacks = {
        onPermissionDenied: jest.fn(),
        onPrepareFailed: jest.fn(),
        onTooShort: jest.fn(),
      };
      const { result, rerender } = await renderHook(
        ({ current }: { current: MediaAttachmentController }) =>
          useChatComposerRecorder({
            attachmentController: current,
            ...callbacks,
          }),
        { initialProps: { current: attachments } },
      );
      await act(() => result.current.startRecording());
      expoAudio.__setRecorderState({
        durationMillis: 4_200,
        isRecording: true,
      });

      // V4: leaving the app stops the take into its preview...
      await act(async () => setAppState("background"));
      expect(result.current.phase).toBe("preview");
      // ...but uploads only run in the foreground, so nothing is queued yet.
      expect(mockStageOwnedCopy).not.toHaveBeenCalled();
      expect(attachments.addAudio).not.toHaveBeenCalled();

      await act(async () => setAppState("active"));
      // Coming back re-renders with a new controller object (the queue
      // publishes); that must not cancel the waiting take (device).
      await rerender({ current: { ...attachments } });
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      expect(attachments.addAudio).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "audio", uri: STAGED }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("a take that cannot be staged returns to idle, uploads nothing, and says so", async () => {
    mockStageOwnedCopy.mockRejectedValue(new Error("copy failed"));
    const attachments = controller();
    const { callbacks, render } = recorderHook(attachments);
    const { result } = await render();

    await recordTake(result);

    expect(attachments.addAudio).not.toHaveBeenCalled();
    expect(callbacks.onPrepareFailed).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("idle");
  });

  test("deleting the take while it is being staged drops the orphan copy", async () => {
    let finishCopy!: (value: { uri: string; byteSize: number }) => void;
    mockStageOwnedCopy.mockReturnValue(
      new Promise((resolve) => {
        finishCopy = resolve;
      }),
    );
    const attachments = controller();
    const { render } = recorderHook(attachments);
    const { result } = await render();

    await act(() => result.current.startRecording());
    expoAudio.__setRecorderState({ durationMillis: 4_200, isRecording: true });
    let stopping!: Promise<void>;
    await act(async () => {
      stopping = result.current.stopRecording();
    });
    await act(async () => result.current.cancelRecording());
    await act(async () => {
      finishCopy({ uri: STAGED, byteSize: 2_048 });
      await stopping;
    });

    expect(attachments.addAudio).not.toHaveBeenCalled();
    expect(mockRemoveStagedFile).toHaveBeenCalledWith(STAGED);
  });

  test("a failed voice upload is announced once with a retry instead of leaving send silently disabled", async () => {
    mockStageOwnedCopy.mockResolvedValue({ uri: STAGED, byteSize: 2_048 });
    const failed: MediaAttachmentQueueItem = {
      byteSize: 2_048,
      confirmed: null,
      duration: 4.2,
      errorMessage: "업로드 실패",
      filename: "voice.m4a",
      height: null,
      kind: "audio",
      localId: "voice:1",
      progress: 0,
      status: "failed",
      uri: STAGED,
      width: null,
    };
    let attachments = controller();
    const { result, rerender } = await renderHook(() =>
      useChatComposer({
        attachmentController: attachments,
        controller: { send: jest.fn() },
        fieldRef: { current: null },
      }),
    );
    await act(() => result.current.recorder.startRecording());
    expoAudio.__setRecorderState({ durationMillis: 4_200, isRecording: true });
    await act(() => result.current.recorder.stopRecording());
    expect(result.current.recorder.phase).toBe("preview");

    attachments = controller([failed]);
    await rerender({});
    await rerender({});

    expect(mockShowNotice).toHaveBeenCalledTimes(1);
    const notice = mockShowNotice.mock.calls[0][0] as {
      actionLabel: string;
      message: string;
      onAction: () => void;
    };
    expect(notice).toMatchObject({
      actionLabel: "다시 시도",
      message: VOICE_UPLOAD_FAILED_MESSAGE,
    });
    notice.onAction();
    expect(attachments.retry).toHaveBeenCalledWith("voice:1");
    expect(VOICE_PREPARE_FAILED_MESSAGE).toContain("다시 녹음");
  });
});
