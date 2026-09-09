import { ESLint } from "eslint";

describe("M7 narrow transport exception", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: jest.requireActual("../../eslint.config.js"),
  });
  async function rules(filePath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }
  test("only the groups API adapter can use direct fetch", async () => {
    expect(
      await rules(
        "src/features/groups/data/groups-api.ts",
        'void fetch("https://example.com");',
      ),
    ).not.toContain("no-restricted-globals");
    for (const filePath of [
      "src/features/groups/model/groups-store.ts",
      "src/features/groups/ui/group-list-screen.tsx",
      "src/app/groups/create.tsx",
    ]) {
      expect(
        await rules(filePath, 'void fetch("https://example.com");'),
      ).toContain("no-restricted-globals");
    }
  });
  test("the adapter does not gain global fetch or WebSocket permission", async () => {
    expect(
      await rules(
        "src/features/groups/data/groups-api.ts",
        'void globalThis.fetch("https://example.com");',
      ),
    ).toContain("no-restricted-properties");
    expect(
      await rules(
        "src/features/groups/data/groups-api.ts",
        'new WebSocket("wss://example.com");',
      ),
    ).toContain("no-restricted-globals");
  });
});
