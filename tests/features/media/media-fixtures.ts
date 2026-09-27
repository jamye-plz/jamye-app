export const uploadId = "77777777-7777-4777-8777-777777777777";
export const targetId = "88888888-8888-4888-8888-888888888888";
export const mediaId = "99999999-9999-4999-8999-999999999999";
export const messageId = "22222222-2222-4222-8222-222222222222";
export const otherId = "55555555-5555-4555-8555-555555555555";
export const posterUploadId = "33333333-3333-4333-8333-333333333333";

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
  poster_upload_id: null,
};

// S3 collapsed UploadFinalizeResult to a single chat-scope shape
// (additionalProperties: false on the wire -- no more topic_media/topic_status).
export const chatUploadFinalizeResultWire = {
  scope: "chat" as const,
  status: "confirmed" as const,
  bound: false as const,
  upload: confirmedUploadWire,
};

// C5 (D4/E10): one chatroom-media timeline item + its page. S3 removed the
// MD3 topic-media fixtures this file used to export (topicMediaWire,
// topicMediaPageWire, topicUploadFinalizeResultWire, topicId).
export const chatroomMediaItemWire = {
  id: mediaId,
  media_upload_id: uploadId,
  message_id: messageId,
  message_created_at: "2026-09-10T23:00:05Z",
  type: "image/jpeg" as const,
  byte_size: 12345,
  width: 800,
  height: 600,
  duration: null,
  filename: "photo.jpg",
  position: 0,
  poster_media_id: null,
};

export const chatroomMediaPageWire = {
  items: [chatroomMediaItemWire],
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
