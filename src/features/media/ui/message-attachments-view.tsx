import { useState } from "react";
import { View } from "react-native";

import { appChatMessage, appSpacing } from "@/core/theme/tokens";
import { MediaImage } from "./media-image";
import { MediaVideoCard } from "./media-video-card";
import { VoiceMessageBubble } from "./voice-message-bubble";
import type { MediaImageCornerStyle } from "./media-image";
import type { MediaPixelSize } from "./media-pixel-size";

/**
 * Structural attachment shape this view renders -- deliberately duplicated
 * (not imported) from chat's `ConnectedChatMedia`: media must not depend on
 * chat (clean-architecture direction: chat depends on media, never the
 * reverse). Any object with these fields, `ConnectedChatMedia` included,
 * satisfies this type by TS structural typing, so chat-list can pass
 * `message.media` straight through without a conversion step.
 */
export type MessageAttachmentMedia = Readonly<{
  id: string;
  /** Wire MIME `content_type` (e.g. `"image/jpeg"`), never a coarse kind. */
  type: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  posterMediaId: string | null;
  position: number;
}>;

const GRID_MAX_WIDTH = 240;
const GRID_GAP = appSpacing.xxs; // 4
const SINGLE_MAX_HEIGHT = 320;
const GRID_CELL_SIZE = (GRID_MAX_WIDTH - GRID_GAP) / 2; // 118
const MAX_REMEMBERED_SIZES = 300;

/**
 * Pixel sizes learned from loaded photos/video thumbnails, keyed by media
 * id. The server records no width/height for chat media (jamye-server ADR
 * 0009), so a single attachment starts as the square fallback and settles on
 * its original ratio once its pixels load; remembering the size lets a
 * re-mounted row (scrolled back into view) start at that ratio instead of
 * jumping again. Bounded, oldest entry evicted first.
 */
const pixelSizes = new Map<string, MediaPixelSize>();

function rememberPixelSize(mediaId: string, size: MediaPixelSize) {
  pixelSizes.delete(mediaId);
  pixelSizes.set(mediaId, size);
  if (pixelSizes.size > MAX_REMEMBERED_SIZES) {
    const oldest = pixelSizes.keys().next().value;
    if (oldest !== undefined) pixelSizes.delete(oldest);
  }
}

function hasServerSize(item: MessageAttachmentMedia): boolean {
  return !!item.width && !!item.height && item.width > 0 && item.height > 0;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}
function isVideoType(type: string): boolean {
  return type === "video/mp4";
}
function isAudioType(type: string): boolean {
  return type.startsWith("audio/");
}

/**
 * Single (non-grid) attachment box: original aspect ratio capped to
 * `GRID_MAX_WIDTH` x `SINGLE_MAX_HEIGHT` (so a tall portrait photo never
 * covers the screen), square fallback when the server didn't record
 * `width`/`height`.
 */
function singleDimensions(
  width: number | null,
  height: number | null,
): Readonly<{ width: number; height: number }> {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: GRID_MAX_WIDTH, height: GRID_MAX_WIDTH };
  }
  const scale = Math.min(GRID_MAX_WIDTH / width, SINGLE_MAX_HEIGHT / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Matches the text bubble's own corner treatment (`chat-message-row.tsx`)
 * so a single photo/video reads as concentric with it: full bubble radius
 * except the tail corner on the conversation side, which uses the smaller
 * directional radius. */
function singleCornerStyle(mine: boolean): MediaImageCornerStyle {
  return {
    borderRadius: appChatMessage.bubbleRadius,
    borderBottomLeftRadius: mine
      ? appChatMessage.bubbleRadius
      : appChatMessage.directionalRadius,
    borderBottomRightRadius: mine
      ? appChatMessage.directionalRadius
      : appChatMessage.bubbleRadius,
  };
}

/**
 * R3 attachment display: presentational only, no colored bubble and no
 * per-attachment share icon (`MediaOpenSaveButton` was removed from this
 * path -- sharing moved to the message menu and this view's viewer/voice
 * affordances). A message's photos/videos (0-4, position-ordered) render as
 * a single box or a 2-column grid; its voice attachment (mutually exclusive
 * with photos/videos per the server's composition rule) renders as its own
 * colored bubble below/instead.
 *
 * `textCombination`: when the caller also has message body text, it renders
 * that text in its own bubble *below* this view -- this component never
 * renders body text itself.
 */
export function MessageAttachmentsView({
  attachments,
  mine,
  previewEnabled,
  onOpenViewer,
  onShareAttachment,
  onLongPressAttachment,
}: Readonly<{
  attachments: readonly MessageAttachmentMedia[];
  mine: boolean;
  previewEnabled: boolean;
  /** Opens the R3 full-screen pager at this index into the visual
   * (photo/video) subset -- see `openMediaViewer`. */
  onOpenViewer: (startIndex: number) => void;
  /** Voice attachments have no full-screen viewer to host a share button,
   * so `VoiceMessageBubble` renders one inline that calls this directly. */
  onShareAttachment: (attachment: MessageAttachmentMedia) => void;
  /** F-10/A20: the chat row opens its message menu (공유, 삭제) here; a
   * long-press never shares directly. */
  onLongPressAttachment: (attachment: MessageAttachmentMedia) => void;
}>) {
  const sorted = [...attachments].sort((a, b) => a.position - b.position);
  const visual = sorted
    .filter((item) => isImageType(item.type) || isVideoType(item.type))
    .slice(0, 4);
  const voice = sorted.filter((item) => isAudioType(item.type));
  // Only a lone photo/video uses its own ratio; grid cells stay square.
  const measurable =
    visual.length === 1 && !hasServerSize(visual[0]) ? visual[0] : null;
  const [learned, setLearned] = useState<Readonly<{
    mediaId: string;
    size: MediaPixelSize;
  }> | null>(null);
  if (attachments.length === 0) return null;
  const measuredSize = measurable
    ? learned?.mediaId === measurable.id
      ? learned.size
      : pixelSizes.get(measurable.id)
    : undefined;
  const onPixelSize = measurable
    ? (size: MediaPixelSize) => {
        const known = pixelSizes.get(measurable.id);
        rememberPixelSize(measurable.id, size);
        if (known?.width !== size.width || known.height !== size.height)
          setLearned({ mediaId: measurable.id, size });
      }
    : undefined;

  return (
    <View style={{ gap: appSpacing.xxs }}>
      {visual.length > 0 ? (
        <View
          style={
            visual.length === 1
              ? undefined
              : {
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: GRID_GAP,
                  width: GRID_MAX_WIDTH,
                }
          }
        >
          {visual.map((item, index) => {
            const dimensions =
              visual.length === 1
                ? singleDimensions(
                    measuredSize?.width ?? item.width,
                    measuredSize?.height ?? item.height,
                  )
                : { width: GRID_CELL_SIZE, height: GRID_CELL_SIZE };
            const cornerStyle =
              visual.length === 1 ? singleCornerStyle(mine) : undefined;
            const openThisAttachment = () => onOpenViewer(index);
            const longPressThisAttachment = () => onLongPressAttachment(item);
            return isVideoType(item.type) ? (
              <MediaVideoCard
                key={item.id}
                bordered
                cornerStyle={cornerStyle}
                dimensions={dimensions}
                filename={item.filename}
                mediaId={item.id}
                onLongPress={longPressThisAttachment}
                onPixelSize={onPixelSize}
                onPress={openThisAttachment}
                posterMediaId={item.posterMediaId}
                thumbnailEnabled={previewEnabled}
              />
            ) : (
              <MediaImage
                key={item.id}
                bordered
                cornerStyle={cornerStyle}
                dimensions={dimensions}
                filename={item.filename}
                mediaId={item.id}
                onLongPress={longPressThisAttachment}
                onPixelSize={onPixelSize}
                onPress={openThisAttachment}
              />
            );
          })}
        </View>
      ) : null}
      {voice.map((item) => (
        <VoiceMessageBubble
          key={item.id}
          duration={item.duration}
          filename={item.filename}
          mediaId={item.id}
          mine={mine}
          onLongPress={() => onLongPressAttachment(item)}
          onShare={() => onShareAttachment(item)}
        />
      ))}
    </View>
  );
}
