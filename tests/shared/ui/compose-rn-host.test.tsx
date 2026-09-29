import { render } from "@testing-library/react-native";
import { View } from "react-native";

import { ComposeRnHost } from "@/shared/ui/compose-rn-host";

describe("ComposeRnHost (default -- no RNHostView; universal ListItem.ios.tsx already hosts leading/trailing)", () => {
  test("renders children directly with no host wrapper", async () => {
    const screen = await render(
      <ComposeRnHost>
        <View testID="child" />
      </ComposeRnHost>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});
