import type { TopicTag } from "@/core/contracts/server";

export type TopicTagsViewProps = Readonly<{
  tags: readonly TopicTag[];
  testID?: string;
}>;
