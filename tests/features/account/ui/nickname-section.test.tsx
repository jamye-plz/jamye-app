import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { useSession } from "@/core/providers/session-provider";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import type {
  AccountLifecycle,
  UpdateNicknameResult,
} from "@/features/account/model/account-lifecycle";
import { NicknameSection } from "@/features/account/ui/nickname-section";

jest.mock("@/core/providers/session-provider", () => ({
  useSession: jest.fn(),
}));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

function profileFixture(nickname: string) {
  return {
    avatarUrl: null,
    createdAt: "2020-01-01T00:00:00Z",
    id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
    nickname,
    provider: "kakao" as const,
  };
}

function sessionValue(nickname: string): ReturnType<typeof useSession> {
  return {
    applyProfile: jest.fn(),
    authorizedRequest: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    principal: { epoch: 1, origin: "https://api.example", userId: "user-1" },
    restore: jest.fn(),
    retryProfile: jest.fn(),
    state: {
      message: null,
      profile: profileFixture(nickname),
      status: "signed-in",
    },
  } as unknown as ReturnType<typeof useSession>;
}

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
      <NicknameSection accountLifecycle={lifecycle} />
    </AppThemeProvider>,
  );
}

describe("nickname section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(sessionValue("기존닉네임"));
  });

  test("uses session.state.profile.nickname as the initial value", async () => {
    const screen = await renderSection(fakeLifecycle());
    expect(screen.getByLabelText("닉네임").props.value).toBe("기존닉네임");
  });

  test("shows an inline error immediately and disables the save button for an empty/whitespace-only value (updateNickname not called)", async () => {
    const updateNickname = jest.fn();
    const screen = await renderSection(fakeLifecycle({ updateNickname }));
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "   ");
    expect(screen.getByText("닉네임을 입력해 주세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "닉네임 저장" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "닉네임 저장" }));
    expect(updateNickname).not.toHaveBeenCalled();
  });

  test("shows an inline error immediately and disables the save button when exceeding 64 characters (updateNickname not called)", async () => {
    const updateNickname = jest.fn();
    const screen = await renderSection(fakeLifecycle({ updateNickname }));
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "a".repeat(65));
    expect(
      screen.getByText("닉네임은 64자 이하로 입력해 주세요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "닉네임 저장" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "닉네임 저장" }));
    expect(updateNickname).not.toHaveBeenCalled();
  });

  test("disables the save button when there is no change", async () => {
    const screen = await renderSection(fakeLifecycle());
    expect(screen.getByRole("button", { name: "닉네임 저장" })).toBeDisabled();
  });

  test("saving a valid nickname makes the button busy while pending and calls updateNickname exactly once", async () => {
    let resolveFn: (result: UpdateNicknameResult) => void = () => undefined;
    const updateNickname = jest.fn(
      () =>
        new Promise<UpdateNicknameResult>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const screen = await renderSection(fakeLifecycle({ updateNickname }));
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByRole("button", { name: "닉네임 저장" }));
    expect(updateNickname).toHaveBeenCalledTimes(1);
    expect(updateNickname).toHaveBeenCalledWith("새닉네임");
    expect(
      screen.getByRole("button", { name: "닉네임 저장 처리 중…" }),
    ).toBeTruthy();
    await act(async () => {
      resolveFn({ profile: profileFixture("새닉네임"), status: "ok" });
      await Promise.resolve();
    });
    expect(screen.getByText("닉네임을 저장했습니다.")).toBeTruthy();
  });

  test("the nickname shown after success follows session.state.profile (not the locally typed draft)", async () => {
    let currentSession = sessionValue("기존닉네임");
    mockUseSession.mockImplementation(() => currentSession);
    let resolveFn: (result: UpdateNicknameResult) => void = () => undefined;
    const updateNickname = jest.fn(
      () =>
        new Promise<UpdateNicknameResult>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const lifecycle = fakeLifecycle({ updateNickname });
    const screen = await renderSection(lifecycle);
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "  새닉네임  ");
    await fireEvent.press(screen.getByRole("button", { name: "닉네임 저장" }));
    // Simulate account-lifecycle's applyProfile publishing the trimmed value.
    currentSession = sessionValue("새닉네임");
    await act(async () => {
      resolveFn({ profile: profileFixture("새닉네임"), status: "ok" });
      await Promise.resolve();
    });
    screen.rerender(
      <AppThemeProvider>
        <NicknameSection accountLifecycle={lifecycle} />
      </AppThemeProvider>,
    );
    expect(screen.getByLabelText("닉네임").props.value).toBe("새닉네임");
  });

  test("an error result shows retry guidance", async () => {
    const updateNickname = jest
      .fn()
      .mockResolvedValueOnce({ code: "database_unavailable", status: "error" });
    const screen = await renderSection(fakeLifecycle({ updateNickname }));
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await act(async () => {
      await fireEvent.press(
        screen.getByRole("button", { name: "닉네임 저장" }),
      );
      await Promise.resolve();
    });
    expect(
      screen.getByText(
        "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
  });

  test("shows which provider is signed in", async () => {
    const screen = await renderSection(fakeLifecycle());
    expect(screen.getByText("kakao 계정으로 로그인됨")).toBeTruthy();
  });

  test("clears the busy state and shows retry guidance even if updateNickname breaks contract and rejects", async () => {
    const updateNickname = jest.fn().mockRejectedValueOnce(new Error("boom"));
    const screen = await renderSection(fakeLifecycle({ updateNickname }));
    await fireEvent.changeText(screen.getByLabelText("닉네임"), "새닉네임");
    await fireEvent.press(screen.getByRole("button", { name: "닉네임 저장" }));
    expect(
      await screen.findByText(
        "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "닉네임 저장" }),
    ).not.toBeDisabled();
    expect(updateNickname).toHaveBeenCalledTimes(1);
  });
});
