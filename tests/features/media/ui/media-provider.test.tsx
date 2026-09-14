import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { AppState, Text } from "react-native";
import type { AppStateStatus } from "react-native";
import { act, render } from "@testing-library/react-native";
import { MediaProvider } from "@/features/media/ui/media-provider";
import {
  useMediaRuntime,
  type MediaRuntime,
} from "@/features/media/model/media-runtime";
import { useMediaPicker } from "@/features/media/ui/use-media-picker";

let mockPrincipal: { origin: string; userId: string; epoch: number } | null;
const mockAuthorize = jest.fn((execute) =>
  execute("test-token", new AbortController().signal),
);
const mockPickImage = jest.fn();
const mockPickAudio = jest.fn();
const mockSweep = jest.fn();
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: mockPrincipal,
    authorizedRequest: mockAuthorize,
  }),
}));
jest.mock("@/core/config/public-env", () => ({
  ...jest.requireActual("@/core/config/public-env"),
  getPublicEnv: () => ({
    appMode: "connected-auth",
    apiOrigin: "https://api.example",
    mediaOrigin: "https://media.example",
  }),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(callback, [callback]),
}));
jest.mock("@/features/media/platform/native-media-transport", () => ({
  createNativeMediaHttpTransport: () => jest.fn(),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  createNativeMediaObjectPutPort: () => ({ put: jest.fn() }),
}));
jest.mock("@/features/media/platform/media-staging", () => ({
  createNativeMediaFileCleanupPort: () => ({ deleteIfExists: jest.fn() }),
  cleanupAllStagedFiles: () => mockSweep(),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  cleanupAllDownloadedFiles: () => mockSweep(),
}));
jest.mock("@/features/media/platform/image-video-picker", () => ({
  pickImageOrVideo: (...args: unknown[]) => mockPickImage(...args),
}));
jest.mock("@/features/media/platform/audio-file-picker", () => ({
  pickAudioFile: () => mockPickAudio(),
}));
jest.mock("@/features/media/platform/media-file-stat", () => ({
  statMediaFile: jest.fn(),
}));

let runtime: MediaRuntime | null;
let chatPicker: ReturnType<typeof useMediaPicker>;
let topicPicker: ReturnType<typeof useMediaPicker>;
let stateListeners: Set<(state: AppStateStatus) => void>;

function Probe() {
  const currentRuntime = useMediaRuntime();
  const currentChatPicker = useMediaPicker("chat", "chat-scope");
  const currentTopicPicker = useMediaPicker("topic", "topic-scope");
  useLayoutEffect(() => {
    runtime = currentRuntime;
    chatPicker = currentChatPicker;
    topicPicker = currentTopicPicker;
  }, [currentRuntime, currentChatPicker, currentTopicPicker]);
  return <Text>media-ready</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrincipal = { origin: "https://api.example", userId: "user-a", epoch: 1 };
  runtime = null;
  stateListeners = new Set();
  AppState.currentState = "active";
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      stateListeners.add(listener);
      return { remove: () => stateListeners.delete(listener) };
    });
  mockPickImage.mockResolvedValue({ status: "cancelled" });
  mockPickAudio.mockResolvedValue({ status: "cancelled" });
});

afterEach(() => jest.restoreAllMocks());

async function openEveryPicker() {
  await act(async () => {
    await topicPicker.pickImageOrVideoAsset();
    await chatPicker.pickImageOrVideoAsset();
    await chatPicker.pickAudioAsset();
  });
  expect(mockPickImage.mock.calls).toEqual([[true], [false]]);
  expect(mockPickAudio).toHaveBeenCalledTimes(1);
}

test("all three pickers remain usable after StrictMode effect cleanup and setup", async () => {
  await render(
    <StrictMode>
      <MediaProvider>
        <Probe />
      </MediaProvider>
    </StrictMode>,
  );
  expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
  expect(stateListeners.size).toBe(1);
  await openEveryPicker();
  expect(runtime!.isCurrent(runtime!.captureGeneration())).toBe(true);
});

test("a suspended screen can reveal the same account without leaving its media runtime disposed", async () => {
  const pending = new Promise<void>(() => {});
  function Screen({ suspended }: { suspended: boolean }) {
    if (suspended) throw pending;
    return <Probe />;
  }
  const tree = (suspended: boolean) => (
    <Suspense fallback={<Text>loading</Text>}>
      <MediaProvider>
        <Screen suspended={suspended} />
      </MediaProvider>
    </Suspense>
  );
  const view = await render(tree(false));
  const previous = runtime!;
  await view.rerender(tree(true));
  expect(previous.isCurrent(previous.captureGeneration())).toBe(false);
  await view.rerender(tree(false));
  await openEveryPicker();
  expect(runtime!.isCurrent(runtime!.captureGeneration())).toBe(true);
  expect(previous.isCurrent(previous.captureGeneration())).toBe(false);
});

test("account replacement and unmount keep old runtimes invalid while foreground can recover the current account", async () => {
  const view = await render(
    <MediaProvider>
      <Probe />
    </MediaProvider>,
  );
  const previous = runtime!;
  mockPrincipal = { ...mockPrincipal!, userId: "user-b", epoch: 2 };
  await view.rerender(
    <MediaProvider>
      <Probe />
    </MediaProvider>,
  );
  expect(previous.isCurrent(previous.captureGeneration())).toBe(false);
  const current = runtime!;
  await act(() => {
    for (const listener of stateListeners) listener("background");
  });
  expect(current.isCurrent(current.captureGeneration())).toBe(false);
  await act(() => {
    for (const listener of stateListeners) listener("active");
  });
  expect(previous.isCurrent(previous.captureGeneration())).toBe(false);
  expect(current.isCurrent(current.captureGeneration())).toBe(true);
  await view.unmount();
  expect(stateListeners.size).toBe(0);
  expect(current.isCurrent(current.captureGeneration())).toBe(false);
});
