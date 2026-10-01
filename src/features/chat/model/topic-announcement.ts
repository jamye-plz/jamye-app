/**
 * E1/C1/U4: parses only the one server-generated topic-announcement shape
 * (`[server] src/application/topics/mod.rs`'s `새로운 주제를 올렸어요: [title](/groups/{g}/topics/{t}/chat)`,
 * stored as a normal `kind='user'` author message, not a system row) so its
 * title can render as a link to topic detail. No general markdown or
 * autolink parsing is attempted (deceptive-link risk, plan
 * api_contracts.E1_announcement_parser) -- anything that does not match this
 * exact pattern is left for the caller to render as plain body text.
 */
export type TopicAnnouncement = Readonly<{
  prefix: "새로운 주제를 올렸어요: ";
  title: string;
  groupId: string;
  topicId: string;
  href: Readonly<{
    pathname: "/groups/[groupId]/topics/[topicId]";
    params: Readonly<{ groupId: string; topicId: string }>;
  }>;
}>;

const ANNOUNCEMENT_PREFIX = "새로운 주제를 올렸어요: ";

// plan api_contracts.E1_announcement_parser.regex. The capture group only
// accepts the title's own escaped delimiters (\\, \[, \], \(, \)) or a plain
// character that is neither `]` nor `\` -- matching the server's own escaping
// (mod.rs) and nothing broader.
const TOPIC_ANNOUNCEMENT_PATTERN =
  /^새로운 주제를 올렸어요: \[((?:\\[\\[\]()]|[^\]\\])+)\]\(\/groups\/([^/]+)\/topics\/([^/]+)\/chat\)$/;

// escape_rule: only \\, \[, \], \(, \) are unescaped -- never general markdown.
const ESCAPED_TITLE_CHAR_PATTERN = /\\([\\[\]()])/g;

function unescapeTitle(rawTitle: string): string {
  return rawTitle.replace(ESCAPED_TITLE_CHAR_PATTERN, "$1");
}

export function parseTopicAnnouncement(body: string): TopicAnnouncement | null {
  const match = TOPIC_ANNOUNCEMENT_PATTERN.exec(body);
  if (!match) return null;
  const [, rawTitle, groupId, topicId] = match;
  if (!rawTitle || !groupId || !topicId) return null;
  return {
    prefix: ANNOUNCEMENT_PREFIX,
    title: unescapeTitle(rawTitle),
    groupId,
    topicId,
    href: {
      pathname: "/groups/[groupId]/topics/[topicId]",
      params: { groupId, topicId },
    },
  };
}
