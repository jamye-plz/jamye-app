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

type RequireFunction = ((id: string) => unknown) & {
  resolve: (id: string) => string;
};

type ModuleModule = Readonly<{
  createRequire: (filename: string) => RequireFunction;
}>;

const { spawnSync } =
  jest.requireActual<ChildProcessModule>("node:child_process");
const { createRequire } = jest.requireActual<ModuleModule>("node:module");

const childTimeoutMs = 750;

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint16LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32LE(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

// `metro` ships `./private/*` as a stable, publicly exported subpath (see
// package.json `exports`); other packages in this tree already depend on it
// (e.g. `metro-transform-worker` requires `metro/private/Assets`). This is
// the same `./lib/imageSize` module Metro's own Assets.js calls into.
function runMetroImageSizeScript(
  type: string,
  contentExpression: string,
  expected?: Record<string, unknown>,
): SpawnSyncResult & { timedOut: boolean } {
  const source = `
    const assert = require("node:assert/strict");
    const { getImageDimensions } = require("metro/private/lib/imageSize");
    const imageSizeModulePath = require.resolve("metro/private/lib/imageSize");
    assert.match(imageSizeModulePath, /node_modules[\\\\/]metro[\\\\/]src[\\\\/]lib[\\\\/]imageSize\\.js$/);
    const content = ${contentExpression};
    ${
      expected
        ? `assert.deepEqual(getImageDimensions(${JSON.stringify(type)}, content, "test-asset"), ${JSON.stringify(expected)});`
        : `try { getImageDimensions(${JSON.stringify(type)}, content, "test-asset"); } catch { /* Malformed or oversized inputs are expected to be rejected. */ }`
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

function runMetroImageSize(
  type: string,
  input: number[],
  expected?: Record<string, unknown>,
) {
  return runMetroImageSizeScript(
    type,
    `Buffer.from(${JSON.stringify(input)})`,
    expected,
  );
}

function expectToTerminate(type: string, input: number[]): void {
  const result = runMetroImageSize(type, input);

  expect(result.timedOut).toBe(false);
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("completed");
}

function expectDimensions(
  type: string,
  input: number[],
  expected: Record<string, unknown>,
): void {
  const result = runMetroImageSize(type, input, expected);

  expect(result.timedOut).toBe(false);
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("completed");
}

const validPng = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 29,
  99, 248, 207, 192, 240, 31, 0, 5, 128, 2, 63, 73, 194, 244, 109, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
];

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

const validWebp = [
  ...ascii("RIFF"),
  ...uint32LE(22),
  ...ascii("WEBP"),
  ...ascii("VP8X"),
  ...uint32LE(10),
  0x00,
  0x00,
  0x00,
  0x00, // flags + reserved
  0x63,
  0x00,
  0x00, // width - 1 = 99 -> width 100
  0x31,
  0x00,
  0x00, // height - 1 = 49 -> height 50
];

const validTiff = [
  ...ascii("II"),
  ...uint16LE(42),
  ...uint32LE(8),
  ...uint16LE(2),
  // ImageWidth (tag 256): SHORT, count 1, value 200
  ...uint16LE(256),
  ...uint16LE(3),
  ...uint32LE(1),
  ...uint16LE(200),
  0x00,
  0x00,
  // ImageLength (tag 257): SHORT, count 1, value 150
  ...uint16LE(257),
  ...uint16LE(3),
  ...uint32LE(1),
  ...uint16LE(150),
  0x00,
  0x00,
];

const validSvg = ascii(
  '<svg width="24" height="24" viewBox="0 0 24 24"></svg>',
);

const jpegTruncatedAfterMarker = [0xff, 0xd8, 0xff];
const jpegUndersizedSegmentLength = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01];
const jpegSegmentLengthExceedsBuffer = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];

const webpChunkLengthExceedsBuffer = [
  ...ascii("RIFF"),
  ...uint32LE(999),
  ...ascii("WEBP"),
  ...ascii("ICCP"),
  ...uint32LE(999999),
];

const webpZeroLengthChunkAtBufferEnd = [
  ...ascii("RIFF"),
  ...uint32LE(100),
  ...ascii("WEBP"),
  ...ascii("ICCP"),
  ...uint32LE(0),
];

const webpTruncatedChunkHeaderAfterFirstChunk = [
  ...ascii("RIFF"),
  ...uint32LE(100),
  ...ascii("WEBP"),
  ...ascii("ICCP"),
  ...uint32LE(2),
  0x00,
  0x00,
  0xff,
  0xfe,
  0xfd,
];

const tiffEntryCountExceedsBuffer = [
  ...ascii("II"),
  ...uint16LE(42),
  ...uint32LE(8),
  ...uint16LE(5),
];

const tiffIfdOffsetBeyondBuffer = [
  ...ascii("II"),
  ...uint16LE(42),
  ...uint32LE(9999),
];

describe("image-size is removed from the dependency tree", () => {
  test("cannot be resolved from the app's own package scope", () => {
    const appRequire = createRequire(`${process.cwd()}/package.json`);
    let error: (Error & { code?: string }) | undefined;

    try {
      appRequire.resolve("image-size");
    } catch (caught) {
      error = caught as Error & { code?: string };
    }

    expect(error?.code).toBe("MODULE_NOT_FOUND");
  });

  test("cannot be resolved from metro's own package scope", () => {
    const appRequire = createRequire(`${process.cwd()}/package.json`);
    const metroRequire = createRequire(
      appRequire.resolve("metro/package.json"),
    );
    let error: (Error & { code?: string }) | undefined;

    try {
      metroRequire.resolve("image-size");
    } catch (caught) {
      error = caught as Error & { code?: string };
    }

    expect(error?.code).toBe("MODULE_NOT_FOUND");
  });
});

describe("Expo metro's own lib/imageSize malformed image loop safety", () => {
  test("keeps valid PNG dimensions available through Metro's own parser", () => {
    expectDimensions("png", validPng, { height: 1, width: 1 });
  });

  test("keeps valid JPEG dimensions available through Metro's own parser", () => {
    expectDimensions("jpeg", validJpegHeader, { height: 3, width: 5 });
  });

  test("keeps valid extended WebP (VP8X) dimensions available through Metro's own parser", () => {
    expectDimensions("webp", validWebp, { height: 50, width: 100 });
  });

  test("keeps valid TIFF dimensions available through Metro's own parser", () => {
    expectDimensions("tiff", validTiff, { height: 150, width: 200 });
  });

  test("keeps valid SVG dimensions available through Metro's own parser", () => {
    expectDimensions("svg", validSvg, { height: 24, width: 24 });
  });

  test.each([
    ["a truncated marker sequence", jpegTruncatedAfterMarker],
    ["an undersized segment length", jpegUndersizedSegmentLength],
    ["a segment length exceeding the buffer", jpegSegmentLengthExceedsBuffer],
  ])("terminates a JPEG marker scan with %s", (_name, input) => {
    expectToTerminate("jpeg", input);
  });

  test.each([
    [
      "a chunk declaring more bytes than the buffer holds",
      webpChunkLengthExceedsBuffer,
    ],
    [
      "a zero-length unknown chunk at the buffer end",
      webpZeroLengthChunkAtBufferEnd,
    ],
    [
      "a truncated chunk header after the first chunk",
      webpTruncatedChunkHeaderAfterFirstChunk,
    ],
  ])("terminates a WebP chunk scan with %s", (_name, input) => {
    expectToTerminate("webp", input);
  });

  test.each([
    ["an entry count exceeding the buffer", tiffEntryCountExceedsBuffer],
    ["an IFD offset beyond the buffer", tiffIfdOffsetBeyondBuffer],
  ])("terminates a TIFF IFD scan with %s", (_name, input) => {
    expectToTerminate("tiff", input);
  });

  test("caps SVG header scanning so an oversized file cannot inflate parse time", () => {
    const result = runMetroImageSizeScript(
      "svg",
      'Buffer.concat([Buffer.alloc(80 * 1024, 0x20), Buffer.from(\'<svg width="1" height="1"></svg>\')])',
    );

    expect(result.timedOut).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("completed");
  });
});
