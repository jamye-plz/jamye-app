import { act, fireEvent, render } from "@testing-library/react-native";
import { MessageAttachmentsView } from "@/features/media/ui/message-attachments-view";
import type { MessageAttachmentMedia } from "@/features/media/ui/message-attachments-view";

const mockMediaImage = jest.fn();
jest.mock("@/features/media/ui/media-image", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MediaImage: (props: Record<string, unknown>) => {
      mockMediaImage(props);
      return ReactActual.createElement(
        Pressable,
        {
          testID: `image-${props.mediaId as string}`,
          onPress: props.onPress as (() => void) | undefined,
          onLongPress: props.onLongPress as (() => void) | undefined,
        },
        ReactActual.createElement(Text, null, "image"),
      );
    },
  };
});

const mockMediaVideoCard = jest.fn();
jest.mock("@/features/media/ui/media-video-card", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MediaVideoCard: (props: Record<string, unknown>) => {
      mockMediaVideoCard(props);
      return ReactActual.createElement(
        Pressable,
        {
          testID: `video-${props.mediaId as string}`,
          onPress: props.onPress as (() => void) | undefined,
          onLongPress: props.onLongPress as (() => void) | undefined,
        },
        ReactActual.createElement(Text, null, "video"),
      );
    },
  };
});

const mockVoiceMessageBubble = jest.fn();
jest.mock("@/features/media/ui/voice-message-bubble", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    VoiceMessageBubble: (props: Record<string, unknown>) => {
      mockVoiceMessageBubble(props);
      return ReactActual.createElement(
        Pressable,
        {
          testID: `voice-${props.mediaId as string}`,
          onPress: props.onShare as (() => void) | undefined,
          onLongPress: props.onLongPress as (() => void) | undefined,
        },
        ReactActual.createElement(Text, null, "voice"),
      );
    },
  };
});

function image(
  overrides: Partial<MessageAttachmentMedia> = {},
): MessageAttachmentMedia {
  return {
    id: "img-1",
    type: "image/jpeg",
    filename: "photo.jpg",
    width: null,
    height: null,
    duration: null,
    posterMediaId: null,
    position: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockMediaImage.mockClear();
  mockMediaVideoCard.mockClear();
  mockVoiceMessageBubble.mockClear();
});

test("renders nothing for an empty attachment list", async () => {
  const screen = await render(
    <MessageAttachmentsView
      attachments={[]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(screen.toJSON()).toBeNull();
});

test("renders visual attachments sorted by position and caps the grid at 4", async () => {
  const attachments = [3, 1, 0, 2, 4].map((position) =>
    image({ id: `img-${position}`, position }),
  );
  await render(
    <MessageAttachmentsView
      attachments={attachments}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage).toHaveBeenCalledTimes(4);
  expect(mockMediaImage.mock.calls.map((call) => call[0].mediaId)).toEqual([
    "img-0",
    "img-1",
    "img-2",
    "img-3",
  ]);
});

test("a single attachment keeps its original aspect ratio, capped to 240x320", async () => {
  await render(
    <MessageAttachmentsView
      attachments={[image({ width: 1000, height: 2000 })]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage.mock.calls[0][0].dimensions).toEqual({
    width: 160,
    height: 320,
  });
});

test("a single attachment without server dimensions falls back to a 240 square", async () => {
  await render(
    <MessageAttachmentsView
      attachments={[image({ width: null, height: null })]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage.mock.calls[0][0].dimensions).toEqual({
    width: 240,
    height: 240,
  });
});

describe("original ratio from loaded pixels (device regression: the server records no chat media size, so every photo showed as a square)", () => {
  function renderSingle(item: MessageAttachmentMedia) {
    return render(
      <MessageAttachmentsView
        attachments={[item]}
        mine
        previewEnabled
        onOpenViewer={jest.fn()}
        onShareAttachment={jest.fn()}
        onLongPressAttachment={jest.fn()}
      />,
    );
  }
  const lastProps = (mock: jest.Mock) =>
    mock.mock.calls[mock.mock.calls.length - 1][0] as {
      dimensions: unknown;
      onPixelSize?: (size: { width: number; height: number }) => void;
    };

  test("a lone photo settles on its loaded ratio and a re-mounted row starts there", async () => {
    const photo = image({ id: "ratio-photo" });
    const screen = await renderSingle(photo);
    expect(lastProps(mockMediaImage).dimensions).toEqual({
      width: 240,
      height: 240,
    });
    await act(() =>
      lastProps(mockMediaImage).onPixelSize?.({ width: 600, height: 400 }),
    );
    expect(lastProps(mockMediaImage).dimensions).toEqual({
      width: 240,
      height: 160,
    });

    await screen.unmount();
    mockMediaImage.mockClear();
    await renderSingle(photo);
    expect(mockMediaImage.mock.calls[0][0].dimensions).toEqual({
      width: 240,
      height: 160,
    });
  });

  test("a lone video settles on its thumbnail's ratio, capped to 240x320", async () => {
    const video = { ...image({ id: "ratio-video" }), type: "video/mp4" };
    await renderSingle(video);
    await act(() =>
      lastProps(mockMediaVideoCard).onPixelSize?.({ width: 360, height: 640 }),
    );
    expect(lastProps(mockMediaVideoCard).dimensions).toEqual({
      width: 180,
      height: 320,
    });
  });

  test("server dimensions win and grid cells stay square, so neither listens for pixels", async () => {
    await renderSingle(image({ id: "server-sized", width: 800, height: 600 }));
    expect(lastProps(mockMediaImage).onPixelSize).toBeUndefined();

    mockMediaImage.mockClear();
    await render(
      <MessageAttachmentsView
        attachments={[
          image({ id: "grid-0", position: 0 }),
          image({ id: "grid-1", position: 1 }),
        ]}
        mine
        previewEnabled
        onOpenViewer={jest.fn()}
        onShareAttachment={jest.fn()}
        onLongPressAttachment={jest.fn()}
      />,
    );
    for (const call of mockMediaImage.mock.calls)
      expect(call[0].onPixelSize).toBeUndefined();
  });
});

test.each([2, 3, 4])(
  "%i attachments lay out as equal 118x118 grid cells",
  async (count) => {
    const attachments = Array.from({ length: count }, (_unused, index) =>
      image({ id: `img-${index}`, position: index, width: 800, height: 600 }),
    );
    await render(
      <MessageAttachmentsView
        attachments={attachments}
        mine
        previewEnabled={false}
        onOpenViewer={jest.fn()}
        onShareAttachment={jest.fn()}
        onLongPressAttachment={jest.fn()}
      />,
    );
    for (const call of mockMediaImage.mock.calls) {
      expect(call[0].dimensions).toEqual({ width: 118, height: 118 });
      expect(call[0].cornerStyle).toBeUndefined();
    }
  },
);

test("a single attachment's corners match the message bubble's directional corner (mine)", async () => {
  await render(
    <MessageAttachmentsView
      attachments={[image()]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage.mock.calls[0][0].cornerStyle).toEqual({
    borderRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 8,
  });
});

test("a single attachment's corners flip for an incoming message", async () => {
  await render(
    <MessageAttachmentsView
      attachments={[image()]}
      mine={false}
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage.mock.calls[0][0].cornerStyle).toEqual({
    borderRadius: 20,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 20,
  });
});

test("every visual attachment is bordered and has no per-attachment share icon", async () => {
  await render(
    <MessageAttachmentsView
      attachments={[image()]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaImage.mock.calls[0][0].bordered).toBe(true);
  // The removed `MediaOpenSaveButton` never receives an `onShareAttachment`
  // call from this view for image/video items -- sharing moved to the
  // menu/viewer.
  expect(mockMediaImage.mock.calls[0][0]).not.toHaveProperty("onShare");
});

test("tapping a grid item opens the viewer at its index within the visual subset", async () => {
  const onOpenViewer = jest.fn();
  const attachments = [
    image({ id: "img-0", position: 0 }),
    { ...image({ id: "video-0", position: 1 }), type: "video/mp4" },
  ];
  const screen = await render(
    <MessageAttachmentsView
      attachments={attachments}
      mine
      previewEnabled
      onOpenViewer={onOpenViewer}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  fireEvent.press(screen.getByTestId("video-video-0"));
  expect(onOpenViewer).toHaveBeenCalledWith(1);
});

test("long-pressing an attachment reports that attachment", async () => {
  const onLongPressAttachment = jest.fn();
  const item = image({ id: "img-0" });
  const screen = await render(
    <MessageAttachmentsView
      attachments={[item]}
      mine
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={onLongPressAttachment}
    />,
  );
  fireEvent(screen.getByTestId("image-img-0"), "longPress");
  expect(onLongPressAttachment).toHaveBeenCalledWith(item);
});

test("a video attachment passes posterMediaId and previewEnabled through to MediaVideoCard", async () => {
  const attachments = [
    {
      ...image({ id: "video-0" }),
      type: "video/mp4",
      posterMediaId: "poster-1",
    },
  ];
  await render(
    <MessageAttachmentsView
      attachments={attachments}
      mine
      previewEnabled
      onOpenViewer={jest.fn()}
      onShareAttachment={jest.fn()}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaVideoCard).toHaveBeenCalledTimes(1);
  expect(mockMediaVideoCard.mock.calls[0][0]).toMatchObject({
    mediaId: "video-0",
    posterMediaId: "poster-1",
    thumbnailEnabled: true,
  });
});

test("a voice attachment renders VoiceMessageBubble and wires its inline share to onShareAttachment", async () => {
  const onShareAttachment = jest.fn();
  const voice = {
    ...image({ id: "voice-0", type: "audio/mp4", filename: null }),
    duration: 12,
  };
  const screen = await render(
    <MessageAttachmentsView
      attachments={[voice]}
      mine={false}
      previewEnabled={false}
      onOpenViewer={jest.fn()}
      onShareAttachment={onShareAttachment}
      onLongPressAttachment={jest.fn()}
    />,
  );
  expect(mockMediaVideoCard).not.toHaveBeenCalled();
  expect(mockMediaImage).not.toHaveBeenCalled();
  expect(mockVoiceMessageBubble).toHaveBeenCalledTimes(1);
  expect(mockVoiceMessageBubble.mock.calls[0][0]).toMatchObject({
    mediaId: "voice-0",
    duration: 12,
    mine: false,
  });
  fireEvent.press(screen.getByTestId("voice-voice-0"));
  expect(onShareAttachment).toHaveBeenCalledWith(voice);
});
