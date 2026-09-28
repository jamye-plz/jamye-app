/**
 * jest manual mock for `expo-audio`. This file lives under
 * `tests/__mocks__/expo-audio.ts` (jest `roots` includes `tests/`, mirroring
 * how `tests/__mocks__/@expo/ui.tsx` is picked up automatically) so any
 * `import ... from "expo-audio"` resolves here without an explicit
 * `jest.mock("expo-audio")` call in the consuming test file.
 *
 * Mirrors the subset of the native module's surface the voice-message
 * feature (V1-V4, E2; sanctioned under `src/features/media/platform/**`)
 * uses: the recorder/player hooks, `RecordingPresets.HIGH_QUALITY` (AAC
 * `.m4a`, E2), `setAudioModeAsync`, and
 * `AudioModule.requestRecordingPermissionsAsync`. `__set*`/`__reset*`
 * helpers drive recorder/player state and permission results from tests
 * without touching real native code.
 */

export const AudioQuality = Object.freeze({
  MIN: 0,
  LOW: 32,
  MEDIUM: 64,
  HIGH: 96,
  MAX: 127,
});

export const RecordingPresets = Object.freeze({
  HIGH_QUALITY: Object.freeze({
    extension: ".m4a",
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    android: Object.freeze({ outputFormat: "mpeg4", audioEncoder: "aac" }),
    ios: Object.freeze({
      outputFormat: "aac ",
      audioQuality: AudioQuality.MAX,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    }),
    web: Object.freeze({ mimeType: "audio/webm", bitsPerSecond: 128000 }),
  }),
  LOW_QUALITY: Object.freeze({
    extension: ".m4a",
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 64000,
    android: Object.freeze({
      extension: ".3gp",
      outputFormat: "3gp",
      audioEncoder: "amr_nb",
    }),
    ios: Object.freeze({
      audioQuality: AudioQuality.MIN,
      outputFormat: "aac ",
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    }),
    web: Object.freeze({ mimeType: "audio/webm", bitsPerSecond: 128000 }),
  }),
});

export type MockRecorderState = {
  canRecord: boolean;
  isRecording: boolean;
  durationMillis: number;
  mediaServicesDidReset: boolean;
  metering?: number;
  url: string | null;
};

export type MockAudioRecorder = {
  id: string;
  currentTime: number;
  isRecording: boolean;
  uri: string | null;
  record: (...args: unknown[]) => void;
  stop: (...args: unknown[]) => Promise<void>;
  pause: (...args: unknown[]) => void;
  prepareToRecordAsync: (...args: unknown[]) => Promise<void>;
  getStatus: () => MockRecorderState;
};

export type MockAudioStatus = {
  id: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  loop: boolean;
  mute: boolean;
  error: string | null;
};

export type MockAudioPlayer = {
  id: string;
  playing: boolean;
  paused: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  isLoaded: boolean;
  play: (...args: unknown[]) => void;
  pause: (...args: unknown[]) => void;
  seekTo: (seconds: number) => Promise<void>;
  replace: (...args: unknown[]) => void;
  remove: (...args: unknown[]) => void;
};

export type MockPermissionResponse = {
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  canAskAgain: boolean;
  expires: "never";
};

const GRANTED_PERMISSIONS: MockPermissionResponse = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

function buildRecorderState(): MockRecorderState {
  return {
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    metering: -160,
    url: null,
  };
}

function buildRecorder(): MockAudioRecorder {
  return {
    id: "mock-audio-recorder",
    currentTime: 0,
    isRecording: false,
    uri: null,
    record: jest.fn(),
    // Like the native recorder, a stopped recorder reports no elapsed time:
    // the take's length has to be read before `stop()`.
    stop: jest.fn(async () => {
      recorderState = {
        ...recorderState,
        durationMillis: 0,
        isRecording: false,
      };
    }),
    pause: jest.fn(),
    prepareToRecordAsync: jest.fn(async () => undefined),
    getStatus: jest.fn(() => recorderState),
  };
}

function buildPlayerStatus(): MockAudioStatus {
  return {
    id: "mock-audio-player",
    currentTime: 0,
    duration: 0,
    playing: false,
    isLoaded: true,
    isBuffering: false,
    didJustFinish: false,
    loop: false,
    mute: false,
    error: null,
  };
}

function buildPlayer(): MockAudioPlayer {
  return {
    id: "mock-audio-player",
    playing: false,
    paused: true,
    currentTime: 0,
    duration: 0,
    muted: false,
    isLoaded: true,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    replace: jest.fn(),
    remove: jest.fn(),
  };
}

let recorderState: MockRecorderState = buildRecorderState();
let recorder: MockAudioRecorder = buildRecorder();
let playerStatus: MockAudioStatus = buildPlayerStatus();
let player: MockAudioPlayer = buildPlayer();
let recordingPermissionResponse: MockPermissionResponse = {
  ...GRANTED_PERMISSIONS,
};

export function useAudioRecorder(): MockAudioRecorder {
  return recorder;
}

export function useAudioRecorderState(): MockRecorderState {
  return recorderState;
}

export function useAudioPlayer(): MockAudioPlayer {
  return player;
}

export function useAudioPlayerStatus(): MockAudioStatus {
  return playerStatus;
}

export const setAudioModeAsync = jest.fn(async () => undefined);

export const AudioModule = {
  requestRecordingPermissionsAsync: jest.fn(
    async () => recordingPermissionResponse,
  ),
  getRecordingPermissionsAsync: jest.fn(
    async () => recordingPermissionResponse,
  ),
};

export const requestRecordingPermissionsAsync =
  AudioModule.requestRecordingPermissionsAsync;
export const getRecordingPermissionsAsync =
  AudioModule.getRecordingPermissionsAsync;

export function __setRecorderState(next: Partial<MockRecorderState>): void {
  recorderState = { ...recorderState, ...next };
}

export function __setRecorder(next: Partial<MockAudioRecorder>): void {
  recorder = { ...recorder, ...next };
}

export function __setPlayerStatus(next: Partial<MockAudioStatus>): void {
  playerStatus = { ...playerStatus, ...next };
}

export function __setPlayer(next: Partial<MockAudioPlayer>): void {
  player = { ...player, ...next };
}

export function __setRecordingPermissionResponse(
  next: Partial<MockPermissionResponse>,
): void {
  recordingPermissionResponse = { ...recordingPermissionResponse, ...next };
}

export function __resetExpoAudioMock(): void {
  recorderState = buildRecorderState();
  recorder = buildRecorder();
  playerStatus = buildPlayerStatus();
  player = buildPlayer();
  recordingPermissionResponse = { ...GRANTED_PERMISSIONS };
}
