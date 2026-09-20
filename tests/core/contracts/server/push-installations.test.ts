import {
  expoInstallationCreateToWire,
  expoInstallationPutToWire,
  mapPushInstallation,
  validateExpoInstallationCreate,
  validateExpoInstallationPut,
  validatePushInstallation,
} from "@/core/contracts/server";

const installationId = "installation-1";
const expoToken = "ExponentPushToken[abc123]";

const createInput = {
  environment: "development" as const,
  expoToken,
  installationId,
  platform: "ios" as const,
};

const pushInstallationWire = {
  disabled_at: null,
  environment: "development",
  installation_id: installationId,
  last_seen_at: "2026-09-16T00:00:00Z",
  message_preview_enabled: false,
  platform: "ios",
  provider: "expo",
};

describe("M12 PushInstallation/ExpoInstallation wire contract", () => {
  test("P2 expoInstallationCreateToWire + validateExpoInstallationCreate accept a valid create body", () => {
    const wire = expoInstallationCreateToWire(createInput);
    expect(wire).toEqual({
      environment: "development",
      expo_token: expoToken,
      installation_id: installationId,
      message_preview_enabled: false,
      platform: "ios",
    });
    expect(validateExpoInstallationCreate(wire)).toBe(true);
  });

  test.each(["ios", "android"] as const)(
    "P2 validateExpoInstallationCreate accepts platform=%s",
    (platform) => {
      expect(
        validateExpoInstallationCreate(
          expoInstallationCreateToWire({ ...createInput, platform }),
        ),
      ).toBe(true);
    },
  );

  test("P2 validateExpoInstallationCreate rejects an unsupported platform/environment", () => {
    expect(
      validateExpoInstallationCreate({
        ...expoInstallationCreateToWire(createInput),
        platform: "windows",
      }),
    ).toBe(false);
    expect(
      validateExpoInstallationCreate({
        ...expoInstallationCreateToWire(createInput),
        environment: "staging",
      }),
    ).toBe(false);
  });

  test("P2 validateExpoInstallationCreate rejects installation_id/expo_token boundary violations", () => {
    expect(
      validateExpoInstallationCreate({
        ...expoInstallationCreateToWire(createInput),
        installation_id: "x".repeat(256),
      }),
    ).toBe(false);
    expect(
      validateExpoInstallationCreate({
        ...expoInstallationCreateToWire(createInput),
        expo_token: "x".repeat(513),
      }),
    ).toBe(false);
    expect(
      validateExpoInstallationCreate({
        ...expoInstallationCreateToWire(createInput),
        installation_id: "",
      }),
    ).toBe(false);
  });

  test("P3 expoInstallationPutToWire + validateExpoInstallationPut accept a valid update body", () => {
    const wire = expoInstallationPutToWire({
      expoToken,
      messagePreviewEnabled: true,
    });
    expect(wire).toEqual({
      expo_token: expoToken,
      message_preview_enabled: true,
    });
    expect(validateExpoInstallationPut(wire)).toBe(true);
  });

  test("P3 validateExpoInstallationPut rejects a missing expo_token", () => {
    expect(validateExpoInstallationPut({ message_preview_enabled: true })).toBe(
      false,
    );
  });

  test("PushInstallation validatePushInstallation + mapPushInstallation round-trip with provider const expo", () => {
    expect(validatePushInstallation(pushInstallationWire)).toBe(true);
    expect(mapPushInstallation(pushInstallationWire as never)).toEqual({
      disabledAt: null,
      environment: "development",
      installationId,
      lastSeenAt: "2026-09-16T00:00:00Z",
      messagePreviewEnabled: false,
      platform: "ios",
      provider: "expo",
    });
  });

  test("PushInstallation validatePushInstallation rejects provider != expo", () => {
    expect(
      validatePushInstallation({ ...pushInstallationWire, provider: "fcm" }),
    ).toBe(false);
  });
});
