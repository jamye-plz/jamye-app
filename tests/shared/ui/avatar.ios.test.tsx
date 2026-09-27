import { render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { View } from "react-native";

import { Avatar } from "@/shared/ui/avatar.ios";

let latestNativeProps: Record<string, unknown> = {};

function MockAvatarNativeComponent(props: Record<string, unknown>) {
  // Capturing props for assertions is a side effect, so it belongs in an
  // effect (React Compiler flags mutating an outer-scope binding during
  // render as impure) -- mirrors tests/__mocks__/@expo/ui.tsx's
  // `listItemMountLog` pattern.
  useEffect(() => {
    latestNativeProps = props;
  });
  return <View testID="jamye-avatar-native" />;
}

// Mocking `@/shared/ui/jamye-ui-native` directly (instead of "expo") avoids
// that module's real `requireNativeView` resolution entirely -- this test
// only needs to prove `Avatar` passes the right props to whatever the
// binding resolves to. `resolveJamyeUiNativeViews`'s ios/android branch
// logic itself is unit-tested directly in jamye-ui-native.test.tsx. Jest
// hoists this `jest.mock` call above the `import { Avatar }` line above
// regardless of source order, so `avatar.ios.tsx`'s own import of
// `JamyeAvatarNativeView` sees this mock.
jest.mock("@/shared/ui/jamye-ui-native", () => ({
  JamyeAvatarNativeView: MockAvatarNativeComponent,
}));

beforeEach(() => {
  latestNativeProps = {};
});

describe("Avatar (ios)", () => {
  test("renders the jamye-ui native avatar view inside a Host with uri/name/size/testID passed through", async () => {
    await render(
      <Avatar
        name="Jamye"
        size={48}
        testID="row-avatar"
        uri="https://example.com/a.png"
      />,
    );
    expect(screen.getByTestId("jamye-avatar-native")).toBeTruthy();
    expect(latestNativeProps.uri).toBe("https://example.com/a.png");
    expect(latestNativeProps.name).toBe("Jamye");
    expect(latestNativeProps.size).toBe(48);
    expect(latestNativeProps.testID).toBe("row-avatar");
  });

  test("passes undefined uri when none is given, leaving the monogram placeholder to the native view", async () => {
    await render(
      <Avatar name="Jamye" size={48} testID="row-avatar" uri={null} />,
    );
    expect(latestNativeProps.uri).toBeUndefined();
  });

  test("upgrades a cleartext http avatar URL (Kakao profile images) to https", async () => {
    await render(
      <Avatar name="Jamye" size={48} uri="http://k.kakaocdn.net/dn/a.jpg" />,
    );
    expect(latestNativeProps.uri).toBe("https://k.kakaocdn.net/dn/a.jpg");
  });

  test.each([
    "file:///var/mobile/Containers/Data/a.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "/relative/a.png",
    "https:// example.com/a.png",
  ])(
    "drops %s (only absolute web URLs reach AsyncImage; the monogram shows instead)",
    async (uri) => {
      await render(<Avatar name="Jamye" size={48} uri={uri} />);
      expect(latestNativeProps.uri).toBeUndefined();
    },
  );

  test("never passes an explicit color hex, so the native view keeps real iOS semantic colors", async () => {
    await render(<Avatar name="Jamye" size={48} />);
    expect(latestNativeProps.accentColorHex).toBeUndefined();
    expect(latestNativeProps.backgroundColorHex).toBeUndefined();
  });
});
