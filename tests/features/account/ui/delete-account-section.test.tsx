import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type {
  AccountLifecycle,
  DeleteAccountResult,
} from "@/features/account/model/account-lifecycle";
import { DeleteAccountSection } from "@/features/account/ui/delete-account-section";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

function fakeLifecycle(
  overrides: Partial<AccountLifecycle> = {},
): AccountLifecycle {
  return {
    deleteAccount: jest.fn(),
    updateNickname: jest.fn(),
    ...overrides,
  };
}

async function renderSection(lifecycle: AccountLifecycle) {
  return render(
    <AppThemeProvider>
      <DeleteAccountSection accountLifecycle={lifecycle} />
    </AppThemeProvider>,
  );
}

function pressAlertButton(alert: jest.SpyInstance, text: "취소" | "삭제") {
  const buttons = alert.mock.calls.at(-1)?.[2] as {
    onPress?: () => void;
    text: string;
  }[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

describe("delete account section", () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  test("pressing delete account shows a destructive confirm and does not call deleteAccount yet", async () => {
    const deleteAccount = jest.fn();
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    expect(alert).toHaveBeenCalledWith(
      "계정 삭제",
      "정말 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
      expect.arrayContaining([
        expect.objectContaining({ style: "cancel", text: "취소" }),
        expect.objectContaining({ style: "destructive", text: "삭제" }),
      ]),
    );
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test("does not call deleteAccount when cancel is pressed", async () => {
    const deleteAccount = jest.fn();
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "취소");
    });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  test("calls deleteAccount exactly once on confirm and disables the row while pending", async () => {
    let resolveFn: (result: DeleteAccountResult) => void = () => undefined;
    const deleteAccount = jest.fn(
      () =>
        new Promise<DeleteAccountResult>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeDisabled();
    await act(async () => {
      resolveFn({ status: "ok" });
      await Promise.resolve();
    });
  });

  test("a blocked result shows guidance and re-enables the row (leaves the session untouched)", async () => {
    const deleteAccount = jest
      .fn()
      .mockResolvedValueOnce({ status: "blocked" });
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText("그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "계정 삭제" }),
    ).not.toBeDisabled();
  });

  test("an error result shows retry guidance, and retrying calls deleteAccount again", async () => {
    const deleteAccount = jest
      .fn()
      .mockResolvedValueOnce({ code: "database_unavailable", status: "error" })
      .mockResolvedValueOnce({ status: "ok" });
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(
        "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "계정 삭제" }),
    ).not.toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });

  test("re-enables the row and shows retry guidance even if deleteAccount breaks contract and rejects", async () => {
    const deleteAccount = jest.fn().mockRejectedValueOnce(new Error("boom"));
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
    });
    expect(
      await screen.findByText(
        "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "계정 삭제" }),
    ).not.toBeDisabled();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  test("the settle callback does not update state after unmount from a successful delete", async () => {
    let resolveFn: (result: DeleteAccountResult) => void = () => undefined;
    const deleteAccount = jest.fn(
      () =>
        new Promise<DeleteAccountResult>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
    });
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeDisabled();
    const warn = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await screen.unmount();
    await act(async () => {
      resolveFn({ status: "ok" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  test("shows a visible busy title while the delete is pending and ignores duplicate confirms", async () => {
    let resolveFn: (result: DeleteAccountResult) => void = () => undefined;
    const deleteAccount = jest.fn(
      () =>
        new Promise<DeleteAccountResult>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const screen = await renderSection(fakeLifecycle({ deleteAccount }));
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    await act(async () => {
      pressAlertButton(alert, "삭제");
    });
    expect(screen.getByText("계정 삭제 처리 중…")).toBeTruthy();
    // A stale confirm callback firing again must not start a second delete,
    // and the disabled row must not reopen the confirm dialog.
    await act(async () => {
      pressAlertButton(alert, "삭제");
    });
    await fireEvent.press(screen.getByRole("button", { name: "계정 삭제" }));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFn({ code: "database_unavailable", status: "error" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("계정 삭제")).toBeTruthy();
    expect(screen.queryByText("계정 삭제 처리 중…")).toBeNull();
  });
});
