import { resolveJamyeUiNativeViews } from "@/shared/ui/jamye-ui-native";

describe("resolveJamyeUiNativeViews", () => {
  test("resolves only the iOS avatar view on ios and never calls requireNativeView for the Android view", () => {
    const requireView = jest.fn(() => "mock-avatar-view");

    const views = resolveJamyeUiNativeViews("ios", requireView as never);

    expect(requireView).toHaveBeenCalledTimes(1);
    expect(requireView).toHaveBeenCalledWith("JamyeUi", "JamyeAvatarView");
    expect(views.avatar).toBe("mock-avatar-view");
    expect(views.dateChipRow).toBeNull();
  });

  test("resolves only the Android date chip row view on android and never calls requireNativeView for the avatar view", () => {
    const requireView = jest.fn(() => "mock-date-chip-row-view");

    const views = resolveJamyeUiNativeViews("android", requireView as never);

    expect(requireView).toHaveBeenCalledTimes(1);
    expect(requireView).toHaveBeenCalledWith("JamyeUi", "JamyeDateChipRowView");
    expect(views.dateChipRow).toBe("mock-date-chip-row-view");
    expect(views.avatar).toBeNull();
  });

  test.each([undefined, "web", "windows"])(
    "resolves neither native view for os=%s",
    (os) => {
      const requireView = jest.fn(() => "unused");

      const views = resolveJamyeUiNativeViews(os, requireView as never);

      expect(requireView).not.toHaveBeenCalled();
      expect(views.avatar).toBeNull();
      expect(views.dateChipRow).toBeNull();
    },
  );
});
