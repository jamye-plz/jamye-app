import {
  AVATAR_CONTENT_TYPE,
  AVATAR_MAX_BYTES,
  AVATAR_UPLOAD_ERROR_CODES,
  avatarUploadCreateToWire,
  classifyAvatarUploadError,
  mapAvatarUploadIntent,
} from "@/core/contracts/server/avatar";
import {
  validateAvatarUploadCreate,
  validateAvatarUploadFinalize,
  validateAvatarUploadIntent,
} from "@/core/contracts/server";

const uploadId = "44444444-4444-4444-8444-444444444444";
const intentWire = {
  upload_id: uploadId,
  presigned_put: {
    url: "https://storage.example.com/avatars/put?sig=abc",
    expires_in: 900 as const,
  },
};

describe("AV-AC8 U4/U5 avatar upload contract (server contract final)", () => {
  test("pins the server's JPEG-only, 1 MiB avatar policy", () => {
    expect(AVATAR_CONTENT_TYPE).toBe("image/jpeg");
    expect(AVATAR_MAX_BYTES).toBe(1_048_576);
  });

  test("avatarUploadCreateToWire builds a schema-valid AvatarUploadCreate", () => {
    const wire = avatarUploadCreateToWire(52_000);
    expect(wire).toEqual({ content_type: "image/jpeg", byte_size: 52_000 });
    expect(validateAvatarUploadCreate(wire)).toBe(true);
  });

  test.each([0, -5, 1.25, AVATAR_MAX_BYTES + 1, Number.NaN])(
    "avatarUploadCreateToWire rejects byte size %p",
    (byteSize) => {
      expect(() => avatarUploadCreateToWire(byteSize)).toThrow();
    },
  );

  test("validateAvatarUploadCreate enforces image/jpeg, byte_size 1..1 MiB and closed properties", () => {
    expect(
      validateAvatarUploadCreate({ content_type: "image/png", byte_size: 10 }),
    ).toBe(false);
    expect(
      validateAvatarUploadCreate({ content_type: "image/jpeg", byte_size: 0 }),
    ).toBe(false);
    expect(
      validateAvatarUploadCreate({
        content_type: "image/jpeg",
        byte_size: AVATAR_MAX_BYTES + 1,
      }),
    ).toBe(false);
    expect(
      validateAvatarUploadCreate({
        content_type: "image/jpeg",
        byte_size: 10,
        extra: true,
      }),
    ).toBe(false);
  });

  test("validateAvatarUploadIntent accepts the 201 body and rejects a wrong expires_in or extra keys", () => {
    expect(validateAvatarUploadIntent(intentWire)).toBe(true);
    expect(
      validateAvatarUploadIntent({
        ...intentWire,
        presigned_put: { ...intentWire.presigned_put, expires_in: 60 },
      }),
    ).toBe(false);
    expect(validateAvatarUploadIntent({ upload_id: uploadId })).toBe(false);
    expect(validateAvatarUploadIntent({ ...intentWire, scope: "chat" })).toBe(
      false,
    );
  });

  test("validateAvatarUploadFinalize accepts only the empty object", () => {
    expect(validateAvatarUploadFinalize({})).toBe(true);
    expect(validateAvatarUploadFinalize({ width: 512 })).toBe(false);
  });

  test("mapAvatarUploadIntent flattens the wire intent and drops nothing the app needs", () => {
    expect(mapAvatarUploadIntent(intentWire)).toEqual({
      uploadId,
      put: {
        url: "https://storage.example.com/avatars/put?sig=abc",
        expiresIn: 900,
      },
    });
  });

  test("the documented server error codes are the final contract names", () => {
    expect(AVATAR_UPLOAD_ERROR_CODES).toEqual(
      expect.objectContaining({
        notFound: "avatar_upload_not_found",
        notPending: "avatar_upload_not_pending",
        objectInvalid: "avatar_object_invalid",
        validation: "request_validation_failed",
        rateLimited: "rate_limit_exceeded",
        storageDegraded: "object_storage_degraded",
        unauthenticated: "authentication_required",
      }),
    );
  });

  test.each([
    [429, "rate_limit_exceeded", "rate_limited"],
    [503, "object_storage_degraded", "storage_unavailable"],
    [422, "avatar_object_invalid", "image_rejected"],
    [422, "request_validation_failed", "image_rejected"],
    [404, "avatar_upload_not_found", "upload_expired"],
    [409, "avatar_upload_not_pending", "upload_expired"],
    [401, "authentication_required", "session_expired"],
    [0, "network_unavailable", "network"],
    [408, "request_timeout", "network"],
    [0, "request_cancelled", "cancelled"],
    [500, "request_failed", "unknown"],
    [502, "invalid_avatar_upload_response", "unknown"],
    [502, "invalid_media_origin_url", "unknown"],
  ])("classifyAvatarUploadError(%i, %s) -> %s", (status, code, kind) => {
    expect(classifyAvatarUploadError({ status, code })).toBe(kind);
  });

  test("classifyAvatarUploadError treats anything that is not an API error as unknown", () => {
    expect(classifyAvatarUploadError(new Error("boom"))).toBe("unknown");
    expect(classifyAvatarUploadError(null)).toBe("unknown");
  });
});
