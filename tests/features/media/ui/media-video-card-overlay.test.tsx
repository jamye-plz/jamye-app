import { render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { darkTheme } from "@/core/theme/tokens";
import {
  createMediaLifetime,
  MediaRuntimeProvider,
} from "@/features/media/model/media-runtime";
import type { MediaRuntime } from "@/features/media/model/media-runtime";
import { MediaVideoCard } from "@/features/media/ui/media-video-card";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "dark"),
}));
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    jest
      .requireActual<typeof import("react")>("react")
      .useEffect(() => callback(), [callback]);
  },
}));
jest.mock("@/shared/ui/app-symbol", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AppSymbol: ({
      name,
      tintColor,
    }: Readonly<{ name: string; tintColor?: string }>) => (
      <View testID={`symbol-${name}`} {...{ tintColor }} />
    ),
  };
});
jest.mock("@/features/media/platform/native-video-thumbnail", () => ({
  createNativeVideoThumbnail: jest.fn(async () => {
    throw new Error("decode");
  }),
}));
jest.mock("@/features/media/platform/media-object-transfer", () => ({
  downloadToFile: jest.fn(async () => undefined),
}));
jest.mock("@/features/media/platform/media-downloads", () => ({
  allocateDownloadDestination: () => ({ uri: "file:///owned/1.mp4" }),
  removeDownloadedFile: jest.fn(),
  retainDownloadedFile: () => () => undefined,
}));
jest.mock("@/features/media/platform/native-video-player", () => ({
  NativeVideoPlayer: () => null,
}));

function Wrapper({ children }: PropsWithChildren) {
  const runtime: MediaRuntime = {
    ...createMediaLifetime(true),
    accountKey: "account-overlay",
    api: {
      getAccess: jest.fn().mockResolvedValue({
        id: "video-1",
        url: "https://media.example/private",
        byteSize: 10,
        contentType: "video/mp4",
      }),
      getDownloadLocation: jest.fn(),
      createUpload: jest.fn(),
      finalizeUpload: jest.fn(),
      listChatroomMedia: jest.fn(),
    },
    authorize: (execute, signal) =>
      execute("api-bearer", signal ?? new AbortController().signal),
    objectPut: { put: jest.fn() },
    cleanup: { deleteIfExists: jest.fn() },
  };
  return (
    <AppThemeProvider>
      <MediaRuntimeProvider value={runtime}>{children}</MediaRuntimeProvider>
    </AppThemeProvider>
  );
}

test("dark theme: the play and preview-retry glyphs stay white over the dark overlay (device regression: they vanished)", async () => {
  // The dark theme's `onPrimary` (the old tint) is a dark tone.
  expect(darkTheme.colors.onPrimary).not.toBe("#FFFFFF");
  const screen = await render(
    <Wrapper>
      <MediaVideoCard mediaId="video-1" filename="clip.mp4" thumbnailEnabled />
    </Wrapper>,
  );
  expect(screen.getByTestId("symbol-play").props.tintColor).toBe("#FFFFFF");
  expect((await screen.findByTestId("symbol-refresh")).props.tintColor).toBe(
    "#FFFFFF",
  );
});
