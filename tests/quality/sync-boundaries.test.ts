import { ESLint } from "eslint";

describe("M9 realtime transport boundary", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: jest.requireActual("../../eslint.config.js"),
  });

  async function rules(filePath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }

  test("only the exact native socket adapter can construct a WebSocket", async () => {
    const source = 'new WebSocket("wss://example.test");';
    expect(
      await rules("src/features/sync/realtime/realtime-socket.ts", source),
    ).not.toContain("no-restricted-globals");
    for (const file of [
      "src/features/sync/realtime/unapproved-socket.ts",
      "src/features/sync/realtime/realtime-coordinator.ts",
      "src/features/sync/outbox/outbox-dispatcher.ts",
      "src/features/sync/model/sync-provider.tsx",
      "src/features/chat/data/chat-api.ts",
      "src/features/chat/ui/connected-chat-screen.tsx",
      "src/core/providers/app-providers.tsx",
    ]) {
      expect(await rules(file, source)).toContain("no-restricted-globals");
    }
  });

  test("the socket exception does not allow unrelated transports", async () => {
    const file = "src/features/sync/realtime/realtime-socket.ts";
    for (const code of [
      'void fetch("https://example.test");',
      "new XMLHttpRequest();",
      'new EventSource("https://example.test");',
      "void NetInfo;",
    ]) {
      expect(await rules(file, code)).toContain("no-restricted-globals");
    }
    expect(
      await rules(file, 'void globalThis.fetch("https://example.test");'),
    ).toContain("no-restricted-properties");
    expect(await rules(file, 'void import("node:http");')).toContain(
      "local/no-restricted-transport-require",
    );
  });

  test("S1/R1 fetch is confined to the exact HTTP adapter", async () => {
    const source = 'void fetch("https://example.test");';
    expect(
      await rules("src/features/sync/realtime/sync-api.ts", source),
    ).not.toContain("no-restricted-globals");
    for (const file of [
      "src/features/sync/model/account-sync.ts",
      "src/features/sync/realtime/realtime-sync.ts",
      "src/features/sync/outbox/outbox-dispatcher.ts",
    ])
      expect(await rules(file, source)).toContain("no-restricted-globals");
    expect(
      await rules(
        "src/features/sync/realtime/sync-api.ts",
        'new WebSocket("wss://example.test");',
      ),
    ).toContain("no-restricted-globals");
  });

  test("sync models use typed account ports, not direct SQLite or HTTP implementations", async () => {
    for (const file of [
      "src/features/sync/model/account-sync.ts",
      "src/features/sync/model/profile-recovery.ts",
      "src/features/sync/realtime/realtime-sync.ts",
      "src/features/sync/outbox/outbox-dispatcher.ts",
    ]) {
      expect(
        await rules(
          file,
          'import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types"; export type R = ConnectedChatRepository;',
        ),
      ).not.toContain("no-restricted-imports");
      for (const path of [
        "expo-sqlite",
        "@/core/database/account/connected-chat-repository",
        "@/core/database/account/connected-chat-sync-repository",
        "@/core/http/http-client",
      ]) {
        expect(
          await rules(
            file,
            `import * as storage from "${path}"; void storage;`,
          ),
        ).toContain("no-restricted-imports");
        expect(await rules(file, `void import("${path}");`)).toContain(
          "local/no-restricted-transport-require",
        );
      }
    }
  });
});
