import { ESLint } from "eslint";

describe("M8 REST chat boundaries", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: jest.requireActual("../../eslint.config.js"),
  });

  async function rules(filePath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }

  test("only the chat API adapter gains the existing narrow fetch exception", async () => {
    expect(
      await rules(
        "src/features/chat/data/chat-api.ts",
        'void fetch("https://example.com");',
      ),
    ).not.toContain("no-restricted-globals");

    for (const filePath of [
      "src/features/chat/data/unapproved-api.ts",
      "src/features/chat/model/connected-chat-service.ts",
      "src/features/chat/model/connected-chat-store.ts",
      "src/features/chat/use-chat-conversation.ts",
      "src/features/chat/ui/chat-screen.tsx",
      "src/app/groups/[groupId]/chatrooms/[chatroomId].tsx",
    ]) {
      expect(
        await rules(filePath, 'void fetch("https://example.com");'),
      ).toContain("no-restricted-globals");
    }
  });

  test("the adapter cannot bypass transport rules or introduce M9 sockets", async () => {
    const path = "src/features/chat/data/chat-api.ts";
    expect(
      await rules(path, 'void globalThis.fetch("https://example.com");'),
    ).toContain("no-restricted-properties");
    expect(await rules(path, 'new WebSocket("wss://example.com");')).toContain(
      "no-restricted-globals",
    );
    expect(await rules(path, 'void import("node:http");')).toContain(
      "local/no-restricted-transport-require",
    );
  });

  test("chat screens and routes cannot reach account persistence", async () => {
    for (const filePath of [
      "src/features/chat/ui/chat-screen.tsx",
      "src/app/groups/[groupId]/chatrooms/[chatroomId].tsx",
    ]) {
      expect(
        await rules(
          filePath,
          'import "@/core/database/account/open-account-database";',
        ),
      ).toContain("no-restricted-imports");
      expect(
        await rules(
          filePath,
          'void import("@/core/database/account/open-account-database");',
        ),
      ).toContain("local/no-restricted-transport-require");
    }
  });

  test("chat models consume the type-only port and cannot open or instantiate SQLite", async () => {
    const path = "src/features/chat/model/connected-chat-store.ts";
    expect(
      await rules(
        path,
        'import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types"; export type Port = ConnectedChatRepository;',
      ),
    ).not.toContain("no-restricted-imports");

    for (const moduleName of [
      "@/core/database/account/open-account-database",
      "@/core/database/account/migrations/002-connected-chat-schema",
      "@/core/database/account/connected-chat-repository",
    ]) {
      expect(await rules(path, `import "${moduleName}";`)).toContain(
        "no-restricted-imports",
      );
      expect(await rules(path, `void import("${moduleName}");`)).toContain(
        "local/no-restricted-transport-require",
      );
    }
  });
});
