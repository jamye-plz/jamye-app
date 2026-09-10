import { ESLint } from "eslint";

describe("M10 typed topic boundaries", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: jest.requireActual("../../eslint.config.js"),
  });
  async function rules(filePath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }
  test("only the exact T1-T7 adapter may fetch; no second socket is allowed", async () => {
    const api = "src/features/topics/data/topics-api.ts";
    expect(
      await rules(api, 'void fetch("https://example.test");'),
    ).not.toContain("no-restricted-globals");
    for (const file of [
      api,
      "src/features/topics/model/topics-store.ts",
      "src/features/topics/ui/topics-screen.tsx",
    ])
      expect(
        await rules(file, 'new WebSocket("wss://example.test");'),
      ).toContain("no-restricted-globals");
    for (const file of [
      "src/features/topics/data/other-api.ts",
      "src/features/topics/model/topics-store.ts",
      "src/features/topics/ui/topics-screen.tsx",
    ])
      expect(
        await rules(file, 'void fetch("https://example.test");'),
      ).toContain("no-restricted-globals");
  });
  test("model uses account ports; screens cannot bypass it to open databases", async () => {
    const model = "src/features/topics/model/topics-store.ts";
    expect(
      await rules(
        model,
        'import type { TopicsRepository } from "@/core/database/account/topics-types"; export type R = TopicsRepository;',
      ),
    ).not.toContain("no-restricted-imports");
    for (const file of [model, "src/features/topics/ui/topics-screen.tsx"])
      for (const path of [
        "expo-sqlite",
        "@/core/database/account/topics-repository",
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
  });
});
