export const groupId = "11111111-1111-4111-8111-111111111111";
export const topicId = "22222222-2222-4222-8222-222222222222";
export const roomId = "33333333-3333-4333-8333-333333333333";
export const authorId = "44444444-4444-4444-8444-444444444444";
export const otherId = "55555555-5555-4555-8555-555555555555";
export const key = "66666666-6666-4666-8666-666666666666";
export const tagWire = {
  id: key,
  topic_id: topicId,
  tag: "여행",
  source: "user" as const,
  confidence: null,
};
export const topicWire = {
  id: topicId,
  group_id: groupId,
  author_id: authorId,
  author_nickname: "작성자",
  author_avatar_url: null,
  title: "오늘 이야기",
  body: null,
  status: "seed" as const,
  tags: [tagWire],
  media: [],
  chatroom_id: roomId,
  unread: false,
  created_at: "2026-09-10T15:00:00Z",
  updated_at: "2026-09-10T15:00:00Z",
};
