import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicImageUploadButton } from "@/features/media/ui/topic-image-upload-button";
import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

const mockPickImageOrVideoAsset = jest.fn();
jest.mock("@/features/media/ui/use-media-picker", () => ({
  useMediaPicker: () => ({
    busy: false,
    pickImageOrVideoAsset: mockPickImageOrVideoAsset,
  }),
}));

function controller(
  items: MediaAttachmentController["items"] = [],
  overrides: Partial<MediaAttachmentController> = {},
): MediaAttachmentController {
  return {
    scopeKey: "topic-1",
    available: true,
    items,
    addImageOrVideo: jest.fn(),
    addAudio: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
    ...overrides,
  };
}

const queuedImage: MediaAttachmentController["items"][number] = {
  localId: "staged-image",
  kind: "image",
  filename: "photo.jpg",
  byteSize: 10,
  width: 2,
  height: 2,
  duration: null,
  status: "staged",
  progress: 0,
  errorMessage: null,
  confirmed: null,
};

beforeEach(() => {
  mockPickImageOrVideoAsset.mockReset();
});

test.each([
  { canManage: false, controllerOverrides: {} },
  { canManage: true, controllerOverrides: { available: false } },
])(
  "renders nothing when canManage=$canManage / available override applies",
  async ({ canManage, controllerOverrides }) => {
    const screen = await render(
      <AppThemeProvider>
        <TopicImageUploadButton
          canManage={canManage}
          controller={controller([], controllerOverrides)}
        />
      </AppThemeProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  },
);

test("idle state exposes a 44pt icon-only add control with the frozen accessibility label", async () => {
  const screen = await render(
    <AppThemeProvider>
      <TopicImageUploadButton canManage controller={controller()} />
    </AppThemeProvider>,
  );
  const button = screen.getByRole("button", { name: "주제 이미지 추가" });
  expect(button).toBeEnabled();
  expect(screen.queryByText("주제 이미지 추가")).toBeNull();
});

test("pressing add opens the image/video picker", async () => {
  mockPickImageOrVideoAsset.mockResolvedValue({ status: "cancelled" });
  const screen = await render(
    <AppThemeProvider>
      <TopicImageUploadButton canManage controller={controller()} />
    </AppThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "주제 이미지 추가" }),
  );
  expect(mockPickImageOrVideoAsset).toHaveBeenCalledTimes(1);
});

test("an uploading item disables the add control and shows a progress indicator instead of the icon", async () => {
  const screen = await render(
    <AppThemeProvider>
      <TopicImageUploadButton
        canManage
        controller={controller([{ ...queuedImage, status: "uploading" }])}
      />
    </AppThemeProvider>,
  );
  expect(
    screen.getByRole("button", { name: "주제 이미지 추가" }),
  ).toBeDisabled();
  expect(screen.getByTestId("topic-image-upload-progress")).toBeTruthy();
});

test("a failed upload keeps the failure message and offers retry/cancel controls", async () => {
  const attach = controller([
    { ...queuedImage, status: "failed", errorMessage: "업로드 실패" },
  ]);
  const screen = await render(
    <AppThemeProvider>
      <TopicImageUploadButton canManage controller={attach} />
    </AppThemeProvider>,
  );
  expect(screen.getByText("업로드 실패")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "주제 이미지 업로드 다시 시도" }),
  );
  expect(attach.retry).toHaveBeenCalledWith(queuedImage.localId);
  await fireEvent.press(
    screen.getByRole("button", { name: "주제 이미지 업로드 취소" }),
  );
  expect(attach.remove).toHaveBeenCalledWith(queuedImage.localId);
});
