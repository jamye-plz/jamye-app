import { render } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";
import { View } from "react-native";

// Mirrors tests/shared/ui/action-list-item.android.test.tsx's local
// RNHostView override: the shared manual mock's RNHostView doesn't set a
// distinguishing testID on its own, so this test needs one to prove
// `matchContents` is actually set.
jest.mock("@expo/ui", () => {
  const shared = jest.requireActual<typeof import("../../__mocks__/@expo/ui")>(
    "../../__mocks__/@expo/ui",
  );
  const { View: RNView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function RNHostView(
    props: Readonly<{ children?: ReactNode; matchContents?: boolean }>,
  ) {
    return (
      <RNView
        testID={
          props.matchContents ? "rn-host-view-match-contents" : "rn-host-view"
        }
      >
        {props.children}
      </RNView>
    );
  }
  return { ...shared, RNHostView };
});

function loadAndroid() {
  return jest.requireActual<{
    ComposeRnHost: (props: { children?: ReactNode }) => React.JSX.Element;
  }>("../../../src/shared/ui/compose-rn-host.android.tsx").ComposeRnHost;
}

describe("ComposeRnHost.android (M15 device regression, group ownership-transfer picker)", () => {
  test("wraps children in RNHostView matchContents", async () => {
    const ComposeRnHost = loadAndroid();
    const screen = await render(
      <ComposeRnHost>
        <View testID="child" />
      </ComposeRnHost>,
    );
    expect(screen.getByTestId("rn-host-view-match-contents")).toBeTruthy();
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});
