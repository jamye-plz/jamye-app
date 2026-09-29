import { act, render } from "@testing-library/react-native";

import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";
import {
  ACCOUNT_RESTORED_MESSAGE,
  AccountRestoreNotice,
} from "@/features/auth/ui/account-restore-notice";

const mockShowNotice = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    const react = jest.requireActual<typeof import("react")>("react");
    react.useEffect(callback, [callback]);
  },
}));
jest.mock("@/shared/ui/system-feedback", () => ({
  useSystemFeedback: () => ({ showNotice: mockShowNotice }),
}));

describe("AccountRestoreNotice (G2/E13)", () => {
  afterEach(() => {
    jest.clearAllMocks();
    pendingAccountRestoreStore.clear();
  });

  test("shows the account-restored notice once when the store has a pending signal", async () => {
    pendingAccountRestoreStore.set();
    await render(<AccountRestoreNotice />);
    expect(mockShowNotice).toHaveBeenCalledTimes(1);
    expect(mockShowNotice).toHaveBeenCalledWith({
      message: ACCOUNT_RESTORED_MESSAGE,
    });
    expect(pendingAccountRestoreStore.peek()).toBe(false);
  });

  test("shows no notice when nothing is pending", async () => {
    await render(<AccountRestoreNotice />);
    expect(mockShowNotice).not.toHaveBeenCalled();
  });

  test("re-rendering after the signal was consumed never shows the notice again", async () => {
    pendingAccountRestoreStore.set();
    const screen = await render(<AccountRestoreNotice />);
    expect(mockShowNotice).toHaveBeenCalledTimes(1);
    screen.rerender(<AccountRestoreNotice />);
    await act(async () => undefined);
    expect(mockShowNotice).toHaveBeenCalledTimes(1);
  });

  test("renders nothing (null)", async () => {
    const screen = await render(<AccountRestoreNotice />);
    expect(screen.toJSON()).toBeNull();
  });
});
