import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { AvatarProps } from "@/shared/ui/avatar.types";

// jest always resolves the bare "@/shared/ui/avatar" specifier as
// "avatar.ios.tsx" (jest-expo hardcodes EXPO_OS="ios"), so the bare/default
// fallback file is only reachable with the explicit filename -- the same
// `jest.requireActual("@/…/file.android.tsx")` technique the shared test
// rules use for Android-only files.
const { Avatar, monogramLetter } = jest.requireActual<{
  Avatar: (props: AvatarProps) => React.JSX.Element;
  monogramLetter: (name: string) => string;
}>("@/shared/ui/avatar.tsx");

function Wrapper({ children }: PropsWithChildren) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}

describe("monogramLetter", () => {
  test("uppercases the first character", () => {
    expect(monogramLetter("jamye")).toBe("J");
  });

  test("keeps the first Korean syllable as-is", () => {
    expect(monogramLetter("정민")).toBe("정");
  });

  test("falls back to a question mark for blank names", () => {
    expect(monogramLetter("   ")).toBe("?");
  });
});

describe("Avatar (default/web fallback)", () => {
  test("always renders the neutral monogram, even when a uri is given", async () => {
    await render(
      <Wrapper>
        <Avatar
          name="정민"
          size={40}
          testID="avatar"
          uri="https://example.com/a.png"
        />
      </Wrapper>,
    );
    expect(
      screen.getByText("정", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("avatar", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test("hides the decorative circle from accessibility", async () => {
    await render(
      <Wrapper>
        <Avatar name="Jamye" size={40} testID="avatar" />
      </Wrapper>,
    );
    const node = screen.getByTestId("avatar", { includeHiddenElements: true });
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
