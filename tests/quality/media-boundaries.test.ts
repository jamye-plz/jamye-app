import { ESLint } from "eslint";

describe("M11 isolated native media boundary", () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: jest.requireActual("../../eslint.config.js"),
  });
  async function rules(filePath: string, code: string) {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => message.ruleId);
  }
  test("Expo transport is confined to native media adapters; global RN fetch stays forbidden", async () => {
    const adapter = "src/features/media/platform/expo-media-transport.ts";
    const imported =
      'import { fetch as mediaFetch } from "expo/fetch"; void mediaFetch;';
    expect(await rules(adapter, imported)).not.toContain(
      "no-restricted-imports",
    );
    expect(
      await rules(adapter, 'void fetch("https://media.example.com");'),
    ).toContain("no-restricted-globals");
    for (const file of [
      "src/features/media/data/media-api.ts",
      "src/features/media/model/media-upload.ts",
      "src/features/media/ui/media-attachment.tsx",
      "src/app/media.tsx",
    ]) {
      expect(await rules(file, imported)).toContain("no-restricted-imports");
      expect(await rules(file, 'void import("expo/fetch");')).toContain(
        "local/no-restricted-transport-require",
      );
    }
  });
  test("screens and pure upload models cannot bypass the native file/picker port", async () => {
    for (const file of [
      "src/features/media/model/media-upload.ts",
      "src/features/media/ui/media-attachment.tsx",
      "src/app/media.tsx",
    ]) {
      for (const moduleName of [
        "expo-file-system",
        "expo-file-system/legacy",
        "expo-image-picker",
        "expo-image-manipulator",
        "expo-video",
        "expo-document-picker",
        "expo-sharing",
      ]) {
        expect(
          await rules(
            file,
            `import * as native from "${moduleName}"; void native;`,
          ),
        ).toContain("no-restricted-imports");
      }
    }
  });
  test("conditional video SDK loading is limited to its native adapter", async () => {
    const adapter = "src/features/media/platform/native-video-player.tsx";
    expect(await rules(adapter, 'void require("expo-video");')).not.toContain(
      "@typescript-eslint/no-require-imports",
    );
    expect(await rules(adapter, 'void require("expo-file-system");')).toContain(
      "@typescript-eslint/no-require-imports",
    );
    for (const file of [
      "src/features/media/ui/media-video-card.tsx",
      "src/features/media/model/media-upload.ts",
      "src/app/media.tsx",
    ]) {
      expect(await rules(file, 'void require("expo-video");')).toContain(
        "local/no-restricted-transport-require",
      );
      expect(await rules(file, 'void import("expo-video");')).toContain(
        "local/no-restricted-transport-require",
      );
    }
  });
});
