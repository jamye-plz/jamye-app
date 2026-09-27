import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { Avatar } from "@/shared/ui/avatar.android";

type MockImageProps = Readonly<{
  onError?: () => void;
  onLoad?: () => void;
  source?: unknown;
}>;

let latestImageProps: MockImageProps = {};

function MockJetpackComposeImage(props: MockImageProps) {
  // Side effect belongs in an effect, not the render body (React Compiler
  // purity rule) -- see the matching note in avatar.ios.test.tsx.
  useEffect(() => {
    latestImageProps = props;
  });
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return <View testID="jamye-avatar-image" />;
}

jest.mock("@expo/ui/jetpack-compose", () => ({
  Image: MockJetpackComposeImage,
}));
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  size: (width: number, height: number) => ({ $type: "size", height, width }),
}));

const HIDDEN = { includeHiddenElements: true } as const;

function Wrapper({ children }: Readonly<{ children?: ReactNode }>) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}

describe("Avatar (android)", () => {
  beforeEach(() => {
    latestImageProps = {};
  });

  test("layers the native compose image over the monogram, which stays mounted", async () => {
    await render(
      <Wrapper>
        <Avatar name="정민" size={40} uri="https://example.com/a.png" />
      </Wrapper>,
    );
    expect(screen.getByTestId("jamye-avatar-image", HIDDEN)).toBeTruthy();
    expect(screen.getByText("정", HIDDEN)).toBeTruthy();
  });

  test("falls back to the monogram alone when no uri is given", async () => {
    await render(
      <Wrapper>
        <Avatar name="Jamye" size={40} />
      </Wrapper>,
    );
    expect(screen.queryByTestId("jamye-avatar-image", HIDDEN)).toBeNull();
    expect(screen.getByText("J", HIDDEN)).toBeTruthy();
  });

  test("upgrades a cleartext http avatar URL (Kakao profile images) to https", async () => {
    await render(
      <Wrapper>
        <Avatar name="Jamye" size={40} uri="http://k.kakaocdn.net/dn/a.jpg" />
      </Wrapper>,
    );
    expect(latestImageProps.source).toEqual({
      uri: "https://k.kakaocdn.net/dn/a.jpg",
    });
  });

  test.each([
    "file:///data/user/0/a.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "content://media/external/images/1",
  ])(
    "never hands %s to the compose image (web URLs only); the monogram shows",
    async (uri) => {
      await render(
        <Wrapper>
          <Avatar name="Jamye" size={40} uri={uri} />
        </Wrapper>,
      );
      expect(screen.queryByTestId("jamye-avatar-image", HIDDEN)).toBeNull();
      expect(screen.getByText("J", HIDDEN)).toBeTruthy();
    },
  );

  test("passes the https uri through to the compose image unchanged", async () => {
    await render(
      <Wrapper>
        <Avatar name="Jamye" size={40} uri="https://example.com/a.png" />
      </Wrapper>,
    );
    expect(latestImageProps.source).toEqual({
      uri: "https://example.com/a.png",
    });
  });

  test("removes the image and keeps the monogram after a load failure", async () => {
    await render(
      <Wrapper>
        <Avatar name="정민" size={40} uri="https://example.com/a.png" />
      </Wrapper>,
    );
    expect(screen.getByTestId("jamye-avatar-image", HIDDEN)).toBeTruthy();

    await act(async () => {
      latestImageProps.onError?.();
    });

    expect(screen.queryByTestId("jamye-avatar-image", HIDDEN)).toBeNull();
    expect(screen.getByText("정", HIDDEN)).toBeTruthy();
  });
});
