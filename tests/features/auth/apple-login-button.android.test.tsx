import { render } from "@testing-library/react-native";

import { AppleLoginButton } from "@/features/auth/ui/apple-login-button.android";

describe("AppleLoginButton (Android)", () => {
  test("renders nothing (D16/U3: no Apple login surface on Android)", async () => {
    const screen = await render(
      <AppleLoginButton busy={false} disabled={false} onPress={jest.fn()} />,
    );
    expect(screen.toJSON()).toBeNull();
  });
});
