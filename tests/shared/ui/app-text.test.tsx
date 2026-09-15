import { render } from "@testing-library/react-native";
import type { TextStyle } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { lightTheme } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

type Variant =
  | "largeTitle"
  | "title"
  | "headline"
  | "body"
  | "subheadline"
  | "footnote"
  | "caption"
  | "label"
  | "metadata";

const CASES: readonly [
  Variant,
  {
    fontSize: number;
    fontWeight: NonNullable<TextStyle["fontWeight"]>;
    lineHeight: number;
  },
][] = [
  ["largeTitle", { fontSize: 34, fontWeight: "700", lineHeight: 41 }],
  ["title", { fontSize: 24, fontWeight: "700", lineHeight: 32 }],
  ["headline", { fontSize: 17, fontWeight: "600", lineHeight: 22 }],
  ["body", { fontSize: 16, fontWeight: "400", lineHeight: 26 }],
  ["subheadline", { fontSize: 15, fontWeight: "400", lineHeight: 20 }],
  ["footnote", { fontSize: 13, fontWeight: "400", lineHeight: 18 }],
  ["caption", { fontSize: 12, fontWeight: "400", lineHeight: 16 }],
  ["label", { fontSize: 14, fontWeight: "600", lineHeight: 20 }],
  ["metadata", { fontSize: 13, fontWeight: "500", lineHeight: 19 }],
];

describe("AppText", () => {
  it.each(CASES)("applies the %s variant styles", async (variant, expected) => {
    const { getByText } = await render(
      <AppThemeProvider>
        <AppText color="#000000" variant={variant}>
          내용
        </AppText>
      </AppThemeProvider>,
    );
    expect(getByText("내용")).toHaveStyle(expected);
  });

  it("defaults color to the theme text color when color is omitted", async () => {
    const { getByText } = await render(
      <AppThemeProvider>
        <AppText>기본 색상</AppText>
      </AppThemeProvider>,
    );
    expect(getByText("기본 색상")).toHaveStyle({
      color: lightTheme.colors.text,
    });
  });

  it("adds a tabular-nums fontVariant when tabular is set", async () => {
    const { getByText } = await render(
      <AppThemeProvider>
        <AppText color="#000000" tabular>
          123
        </AppText>
      </AppThemeProvider>,
    );
    expect(getByText("123")).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });
});
