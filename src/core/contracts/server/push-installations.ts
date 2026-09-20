import type {
  ExpoInstallationCreateWire,
  ExpoInstallationPutWire,
  PushInstallationWire,
} from "./validators";

export type PushInstallationPlatform = PushInstallationWire["platform"];
export type PushInstallationEnvironment = PushInstallationWire["environment"];

export type PushInstallation = Readonly<{
  installationId: string;
  platform: PushInstallationPlatform;
  environment: PushInstallationEnvironment;
  provider: "expo";
  messagePreviewEnabled: boolean;
  lastSeenAt: string;
  disabledAt: string | null;
}>;

export type ExpoInstallationCreateInput = Readonly<{
  platform: PushInstallationPlatform;
  environment: PushInstallationEnvironment;
  installationId: string;
  expoToken: string;
  messagePreviewEnabled?: boolean;
}>;

export type ExpoInstallationPutInput = Readonly<{
  expoToken: string;
  messagePreviewEnabled?: boolean;
}>;

export function mapPushInstallation(
  wire: PushInstallationWire,
): PushInstallation {
  return {
    disabledAt: wire.disabled_at,
    environment: wire.environment,
    installationId: wire.installation_id,
    lastSeenAt: wire.last_seen_at,
    messagePreviewEnabled: wire.message_preview_enabled,
    platform: wire.platform,
    provider: "expo",
  };
}

export function expoInstallationCreateToWire(
  input: ExpoInstallationCreateInput,
): ExpoInstallationCreateWire {
  return {
    environment: input.environment,
    expo_token: input.expoToken,
    installation_id: input.installationId,
    message_preview_enabled: input.messagePreviewEnabled ?? false,
    platform: input.platform,
  };
}

export function expoInstallationPutToWire(
  input: ExpoInstallationPutInput,
): ExpoInstallationPutWire {
  return {
    expo_token: input.expoToken,
    ...(input.messagePreviewEnabled !== undefined
      ? { message_preview_enabled: input.messagePreviewEnabled }
      : {}),
  };
}
