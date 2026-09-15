import { render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import {
  APP_SYMBOLS,
  AppSymbol,
  type AppSymbolName,
} from "@/shared/ui/app-symbol";

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
