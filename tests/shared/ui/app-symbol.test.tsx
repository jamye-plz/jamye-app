import { render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  APP_SYMBOLS,
  AppSymbol,
  type AppSymbolName,
  symbolViewSizing,
} from "@/shared/ui/app-symbol";

type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

// `expo-symbols`' iOS `SymbolView` renders a native view (mocked by
// jest-expo) whose props are the *native*, already-platform-resolved props
// (`name` becomes a plain string, `tint` a processed color) rather than the
// original `{ ios, android }` object AppSymbol passes in. This project's
// `test-renderer` (via @testing-library/react-native) only exposes host
// instances (no `UNSAFE_getByType`/composite lookup), so we locate that
// native host node by a prop unique to `expo-symbols`' native prop mapping
// (`animated`, added by `SymbolView.ios.tsx`'s `getNativeProps`).
function findSymbolHost(
  container: Awaited<ReturnType<typeof render>>["container"],
) {
  const [host] = container.queryAll((node) => "animated" in node.props);
  return host;
}

describe("APP_SYMBOLS", () => {
  it("provides both an ios and an android name for every AppSymbolName", () => {
    const names = Object.keys(APP_SYMBOLS) as AppSymbolName[];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const entry = APP_SYMBOLS[name];
      expect(typeof entry.ios).toBe("string");
      expect(entry.ios.length).toBeGreaterThan(0);
      expect(typeof entry.android).toBe("string");
      expect(entry.android.length).toBeGreaterThan(0);
    }
  });

  it("adds only the round-2 names (M14 round 2) without touching existing entries", () => {
    const added: Record<string, { ios: string; android: string }> = {
      copy: { android: "content_copy", ios: "doc.on.doc" },
      markRead: { android: "mark_email_read", ios: "envelope.open" },
      microphone: { android: "mic", ios: "mic" },
      newMessage: { android: "chat", ios: "bubble.left" },
      newTopic: { android: "article", ios: "doc.text" },
      pause: { android: "pause", ios: "pause.fill" },
      scrollDown: { android: "arrow_downward", ios: "arrow.down" },
      stop: { android: "stop", ios: "stop.fill" },
    };
    for (const [name, expected] of Object.entries(added)) {
      expect(APP_SYMBOLS[name as AppSymbolName]).toEqual(expected);
    }
    // Existing entries are reused as-is, not aliased.
    expect(APP_SYMBOLS.play).toEqual({
      android: "play_circle",
      ios: "play.circle.fill",
    });
    expect(APP_SYMBOLS.share).toEqual({
      android: "share",
      ios: "square.and.arrow.up",
    });
  });
});

describe("AppSymbol", () => {
  it("renders the native symbol view with the ios-resolved name and size", async () => {
    const { container } = await render(
      <AppThemeProvider>
        <AppSymbol accessibilityLabel="전송" name="send" size={30} />
      </AppThemeProvider>,
    );
    const symbolHost = findSymbolHost(container);
    expect(symbolHost).toBeDefined();
    expect(symbolHost.props.name).toBe(APP_SYMBOLS.send.ios);
    expect(symbolHost.props.size).toBe(30);
  });

  it("is decorative by default when no accessibilityLabel is given", async () => {
    const { container } = await render(
      <AppThemeProvider>
        <AppSymbol name="close" />
      </AppThemeProvider>,
    );
    const symbolHost = findSymbolHost(container);
    expect(symbolHost.props.accessible).toBe(false);
    expect(symbolHost.props.accessibilityElementsHidden).toBe(true);
    expect(symbolHost.props.importantForAccessibility).toBe("no");
  });

  it("becomes accessible once an accessibilityLabel is provided", async () => {
    const { container } = await render(
      <AppThemeProvider>
        <AppSymbol accessibilityLabel="닫기" name="close" />
      </AppThemeProvider>,
    );
    const symbolHost = findSymbolHost(container);
    expect(symbolHost.props.accessible).toBe(true);
    expect(symbolHost.props.accessibilityLabel).toBe("닫기");
  });
});

// F-3 (Android font-scale 200%, group info rename pencil clipped):
// expo-symbols' Android `SymbolView` draws the glyph with a plain RN `<Text
// fontSize={size} lineHeight={size}>` that keeps the default
// `allowFontScaling`, while the surrounding box stays a fixed `{size, size}`
// View (expo-symbols/build/SymbolView.js) -- at large system font scales the
// glyph outgrows that box and clips.
//
// jest-expo's babel transform inlines `process.env.EXPO_OS` to the literal
// "ios" for this whole test file (same constraint documented in
// `core/theme/tokens.ts`'s `resolveThemeColorForOs` and in this project's
// auth-screen/clipboard tests), so a render can never exercise the "android"
// branch under jest. `symbolViewSizing` is exported as a pure function (the
// same shape as `resolveThemeColorForOs(os, ...)` / `authIntroText(os)`) for
// exactly that reason: it takes `os` as an explicit argument so every branch
// is unit-testable, while `AppSymbol` itself calls it with the real
// `process.env.EXPO_OS`.
describe("symbolViewSizing (F-3)", () => {
  test("shrinks the size and pins the box to the nominal size on Android at 2x font scale", () => {
    expect(symbolViewSizing("android", 18, 2)).toEqual({
      size: 9,
      style: { height: 18, width: 18 },
    });
  });

  test("is a numeric no-op on Android at the default (1x) font scale", () => {
    expect(symbolViewSizing("android", 18, 1)).toEqual({
      size: 18,
      style: { height: 18, width: 18 },
    });
  });

  test("leaves size unchanged and returns no style override on iOS, regardless of font scale", () => {
    expect(symbolViewSizing("ios", 18, 2)).toEqual({ size: 18, style: null });
    expect(symbolViewSizing("ios", 18, 1)).toEqual({ size: 18, style: null });
  });

  test("leaves size unchanged and returns no style override for an unknown/undefined os", () => {
    expect(symbolViewSizing(undefined, 18, 2)).toEqual({
      size: 18,
      style: null,
    });
  });
});

describe("AppSymbol Android glyph scaling (F-3)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Wiring guard: jest can never flip `process.env.EXPO_OS` to "android" to
  // observe this through a render, so assert by source text (same technique
  // already used for the Android a11y checks in
  // tests/features/chat/chat-accessibility.test.tsx) that AppSymbol really
  // calls `symbolViewSizing` with the live `process.env.EXPO_OS`, not a
  // hardcoded platform string.
  test("AppSymbol wires process.env.EXPO_OS into symbolViewSizing", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/shared/ui/app-symbol.tsx`,
      "utf8",
    );
    expect(source).toMatch(/symbolViewSizing\(\s*process\.env\.EXPO_OS/);
  });

  // Renders through jest-expo's real (always-"ios") platform: native SF
  // Symbols aren't affected by this bug, so size and style must stay exactly
  // as passed regardless of the system font scale.
  test.each([1, 2])(
    "iOS keeps the nominal size and the caller's style at font scale %i",
    async (fontScale) => {
      const RN =
        jest.requireActual<typeof import("react-native")>("react-native");
      jest.spyOn(RN, "useWindowDimensions").mockReturnValue({
        fontScale,
        height: 852,
        scale: 3,
        width: 393,
      });
      const style = { marginLeft: 4 };
      const { container } = await render(
        <AppThemeProvider>
          <AppSymbol name="edit" size={18} style={style} />
        </AppThemeProvider>,
      );
      const symbolHost = findSymbolHost(container);
      expect(symbolHost.props.size).toBe(18);
      // expo-symbols' iOS `SymbolView.ios.tsx` (getNativeProps) already
      // wraps `style` as `[{width:size,height:size}, props.style]` before
      // handing off to the native host -- today's behavior, independent of
      // this fix (symbolViewSizing returns `style: null` on iOS, so
      // AppSymbol passes `style` straight through unchanged).
      expect(symbolHost.props.style).toEqual([
        { height: 18, width: 18 },
        style,
      ]);
    },
  );
});
