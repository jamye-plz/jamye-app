import type { Message as RepositoryMessage } from "@/core/database/repositories/database-repository";

export type ChatMessage = RepositoryMessage;

export type MessageWindowItem = Readonly<{
  createdAtMs: number;
  localId: string;
}>;

function sameItem<Value extends MessageWindowItem>(
  left: Value,
  right: Value,
): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => leftRecord[key] === rightRecord[key])
  );
}

export function mergeMessageWindow<Value extends MessageWindowItem>(
  current: readonly Value[],
  incoming: readonly Value[],
): Value[] {
  const byLocalId = new Map(current.map((item) => [item.localId, item]));

  for (const item of incoming) {
    const existing = byLocalId.get(item.localId);
    byLocalId.set(
      item.localId,
      existing && sameItem(existing, item) ? existing : item,
    );
  }

  return [...byLocalId.values()].sort(
    (left, right) =>
      left.createdAtMs - right.createdAtMs ||
      left.localId.localeCompare(right.localId),
  );
}
