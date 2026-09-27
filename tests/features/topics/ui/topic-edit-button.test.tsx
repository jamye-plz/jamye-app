import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { TopicEditButton } from "@/features/topics/ui/topic-edit-button";
import { TopicEditButton as IosTopicEditButton } from "@/features/topics/ui/topic-edit-button.ios";

jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: { options?: { headerRight?: () => ReactNode } }) =>
      props.options?.headerRight ? <>{props.options.headerRight()}</> : null,
    ...jest
      .requireActual<typeof import("../../../support/stack-toolbar-mock")>(
        "../../../support/stack-toolbar-mock",
      )
      .createStackToolbarMock(),
  },
}));
jest.mock("@expo/ui", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
      <View testID={testID}>{children}</View>
    ),
  };
});
jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Icon: ({ contentDescription }: { contentDescription?: string }) => (
      <Text>{contentDescription}</Text>
    ),
    IconButton: ({
      children,
      enabled,
      onClick,
    }: {
      children?: ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: enabled === false }}
        onPress={onClick}
      >
        {children}
      </Pressable>
    ),
  };
});

function loadAndroid() {
  return jest.requireActual<{
    TopicEditButton: (props: { onPress: () => void }) => React.JSX.Element;
  }>("../../../../src/features/topics/ui/topic-edit-button.android.tsx")
    .TopicEditButton;
}

describe("TopicEditButton (fallback and iOS)", () => {
  test.each([
    ["fallback", TopicEditButton],
    ["iOS", IosTopicEditButton],
  ])(
    "%s renders a 주제 편집 nav-bar button that calls onPress",
    async (_name, Component) => {
      const onPress = jest.fn();
      const screen = await render(<Component onPress={onPress} />);
      const button = screen.getByRole("button", { name: "주제 편집" });
      await fireEvent.press(button);
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );
});

describe("TopicEditButton (Android)", () => {
  test("renders a pencil icon button in headerRight and calls onPress", async () => {
    const AndroidTopicEditButton = loadAndroid();
    const onPress = jest.fn();
    const screen = await render(<AndroidTopicEditButton onPress={onPress} />);
    expect(screen.getByText("주제 편집")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
