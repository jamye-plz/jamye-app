type ProcessError = Error & { code?: string };

type SpawnSyncResult = Readonly<{
  error?: ProcessError;
  signal: string | null;
  status: number | null;
  stdout: string | null;
}>;

type ChildProcessModule = Readonly<{
  spawnSync: (
    file: string,
    arguments_: readonly string[],
    options: Readonly<{
      cwd: string;
      encoding: "utf8";
      env: Record<string, string | undefined>;
      killSignal: "SIGKILL";
      stdio: "pipe";
      timeout: number;
    }>,
  ) => SpawnSyncResult;
}>;

const { spawnSync } =
  jest.requireActual<ChildProcessModule>("node:child_process");

const childTimeoutMs = 750;

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function box(size: number, name: string, payload: number[] = []): number[] {
  return [...uint32(size), ...ascii(name), ...payload];
}

function runMetroImageSize(
  input: number[],
  expected?: Record<string, unknown>,
) {
  const source = `
    const assert = require("node:assert/strict");
    const { createRequire } = require("node:module");
    const metroRequire = createRequire(require.resolve("metro/package.json"));
    const imageSizePath = metroRequire.resolve("image-size");
    const { imageSize } = metroRequire("image-size");
    assert.match(imageSizePath, /node_modules[\\\\/]image-size[\\\\/]dist[\\\\/]index\\.js$/);
    const input = Uint8Array.from(${JSON.stringify(input)});
    ${
      expected
        ? `assert.deepEqual(imageSize(input), ${JSON.stringify(expected)});`
        : "try { imageSize(input); } catch { /* Malformed inputs may be rejected. */ }"
    }
    process.stdout.write("completed");
  `;

  const result = spawnSync(
    process.execPath,
    ["--input-type=commonjs", "-e", source],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {},
      killSignal: "SIGKILL",
      stdio: "pipe",
      timeout: childTimeoutMs,
    },
  );
  const error = result.error as ProcessError | undefined;

  return {
    ...result,
    timedOut: error?.code === "ETIMEDOUT",
  };
}

function expectToTerminate(input: number[]): void {
  const result = runMetroImageSize(input);

  expect(result.timedOut).toBe(false);
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("completed");
}

function expectDimensions(
  input: number[],
  expected: Record<string, unknown>,
): void {
  const result = runMetroImageSize(input, expected);

  expect(result.timedOut).toBe(false);
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("completed");
}

const jxlContainerPrefix = [
  ...box(12, "JXL ", [0x0d, 0x0a, 0x87, 0x0a]),
  ...box(12, "ftyp", ascii("jxl ")),
];

const zeroLengthIcnsEntry = [
  ...ascii("icns"),
  ...uint32(24),
  ...ascii("ic07"),
  ...uint32(8),
  ...ascii("ic08"),
  ...uint32(0),
];

const nestedZeroLengthHeifBox = [
  ...box(12, "ftyp", ascii("heic")),
  ...box(28, "meta", [
    0x00,
    0x00,
    0x00,
    0x00,
    ...box(16, "iprp", box(0, "ipco")),
  ]),
];

const nestedUndersizedHeifBox = [
  ...box(12, "ftyp", ascii("heic")),
  ...box(28, "meta", [
    0x00,
    0x00,
    0x00,
    0x00,
    ...box(16, "iprp", box(7, "ipco")),
  ]),
];

const nestedTruncatedHeifBox = [
  ...box(12, "ftyp", ascii("heic")),
  ...box(28, "meta", [
    0x00,
    0x00,
    0x00,
    0x00,
    ...box(16, "iprp", [...uint32(12), ...ascii("ipco")]),
  ]),
];

const validIcns = [
  ...ascii("icns"),
  ...uint32(16),
  ...ascii("ic07"),
  ...uint32(8),
];

const partialLargeIcns = [
  ...ascii("icns"),
  ...uint32(512 * 1024 + 8),
  ...ascii("ic07"),
  ...uint32(8),
];

const validJxlContainer = [
  ...jxlContainerPrefix,
  ...box(12, "jxlc", [0xff, 0x0a, 0x03, 0x04]),
];

const validHeif = [
  ...box(12, "ftyp", ascii("heic")),
  ...box(48, "meta", [
    0x00,
    0x00,
    0x00,
    0x00,
    ...box(
      36,
      "iprp",
      box(
        28,
        "ipco",
        box(20, "ispe", [0x00, 0x00, 0x00, 0x00, ...uint32(7), ...uint32(9)]),
      ),
    ),
  ]),
];

describe("image-size malformed image loop safety through Metro", () => {
  test("keeps valid PNG dimensions available through Metro's consumer", () => {
    const validPng = [
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
      8, 29, 99, 248, 207, 192, 240, 31, 0, 5, 128, 2, 63, 73, 194, 244, 109, 0,
      0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];

    expectDimensions(validPng, {
      height: 1,
      type: "png",
      width: 1,
    });
  });

  test("keeps valid JPEG dimensions available through Metro's consumer", () => {
    const validJpegHeader = [
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...ascii("JFIF\0"),
      0x01,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
      0xff,
      0xc0,
      0x00,
      0x0b,
      0x08,
      0x00,
      0x03,
      0x00,
      0x05,
      0x01,
      0x01,
      0x11,
      0x00,
    ];

    expectDimensions(validJpegHeader, {
      height: 3,
      type: "jpg",
      width: 5,
    });
  });

  test("keeps recognized ICNS dimensions available through Metro's consumer", () => {
    expectDimensions(validIcns, {
      height: 128,
      type: "ic07",
      width: 128,
    });
  });

  test("keeps a capped ICNS file prefix usable through Metro's consumer", () => {
    expectDimensions(partialLargeIcns, {
      height: 128,
      images: [{ height: 128, type: "ic07", width: 128 }],
      type: "icns",
      width: 128,
    });
  });

  test("keeps valid JPEG XL dimensions available through Metro's consumer", () => {
    expectDimensions(validJxlContainer, {
      height: 16,
      type: "jxl",
      width: 24,
    });
  });

  test("keeps valid HEIF dimensions available through Metro's consumer", () => {
    expectDimensions(validHeif, {
      height: 9,
      type: "heic",
      width: 7,
    });
  });

  test.each([
    ["a later zero-length entry", zeroLengthIcnsEntry],
    [
      "an undersized first entry",
      [...ascii("icns"), ...uint32(16), ...ascii("ic07"), ...uint32(7)],
    ],
    [
      "a truncated first entry",
      [...ascii("icns"), ...uint32(16), ...ascii("ic07")],
    ],
  ])("terminates an ICNS parser with %s", (_name, input) => {
    expectToTerminate(input);
  });

  test.each([
    ["zero-length JXLP", [...jxlContainerPrefix, ...box(0, "jxlp")]],
    ["undersized JXLP", [...jxlContainerPrefix, ...box(7, "jxlp")]],
    ["short JXLP payload", [...jxlContainerPrefix, ...box(8, "jxlp")]],
    [
      "truncated JXLP",
      [...jxlContainerPrefix, ...uint32(12), ...ascii("jxlp")],
    ],
  ])("terminates a %s JPEG XL box", (_name, input) => {
    expectToTerminate(input);
  });

  test.each([
    ["zero-length", nestedZeroLengthHeifBox],
    ["undersized", nestedUndersizedHeifBox],
    ["truncated", nestedTruncatedHeifBox],
  ])("terminates nested %s HEIF boxes", (_name, input) => {
    expectToTerminate(input);
  });
});
