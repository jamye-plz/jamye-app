export const uploadId = "77777777-7777-4777-8777-777777777777";
export const targetId = "88888888-8888-4888-8888-888888888888";
export const mediaId = "99999999-9999-4999-8999-999999999999";
export const topicId = "22222222-2222-4222-8222-222222222222";
export const otherId = "55555555-5555-4555-8555-555555555555";

export const uploadIntentWire = {
  id: uploadId,
  scope: "chat" as const,
  target_id: targetId,
  object_key: "chat/xyz.jpg",
  kind: "image" as const,
  content_type: "image/jpeg",
  byte_size: 12345,
  filename: "photo.jpg",
  expires_at: "2026-09-11T00:00:00Z",
  created_at: "2026-09-10T23:00:00Z",
};

export const presignedPutWire = {
  url: "https://media.example.com/bucket/chat/xyz.jpg?sig=abc",
  expires_in: 3600 as const,
};

export const uploadIntentWithPresignedPutWire = {
  upload: uploadIntentWire,
  put: presignedPutWire,
};

export const confirmedUploadWire = {
  id: uploadId,
  scope: "chat" as const,
  target_id: targetId,
  object_key: "chat/xyz.jpg",
  kind: "image" as const,
  content_type: "image/jpeg",
  byte_size: 12345,
  duration: null,
  filename: "photo.jpg",
  confirmed_at: "2026-09-10T23:00:05Z",
};

export const chatUploadFinalizeResultWire = {
  scope: "chat" as const,
  status: "confirmed" as const,
  bound: false as const,
  upload: confirmedUploadWire,
  topic_media: null,
  topic_status: null,
};

export const topicMediaWire = {
  id: mediaId,
  topic_id: topicId,
  media_upload_id: uploadId,
  content_type: "image/jpeg",
  object_key: "topic/xyz.jpg",
  width: 800,
  height: 600,
  byte_size: 12345,
  created_at: "2026-09-10T23:00:05Z",
};

export const topicUploadFinalizeResultWire = {
  scope: "topic" as const,
  status: "bound" as const,
  bound: true as const,
  upload: {
    ...confirmedUploadWire,
    scope: "topic" as const,
    target_id: topicId,
  },
  topic_media: topicMediaWire,
  topic_status: "enriched" as const,
};

export const topicMediaPageWire = {
  items: [topicMediaWire],
  next_cursor: null,
};

export const mediaAccessUrlWire = {
  id: mediaId,
  media_upload_id: uploadId,
  url: "https://media.example.com/bucket/topic/xyz.jpg?sig=xyz",
  content_type: "image/jpeg",
  byte_size: 12345,
  width: 800,
  height: 600,
  duration: null,
  filename: "photo.jpg",
  expires_in: 600 as const,
};
