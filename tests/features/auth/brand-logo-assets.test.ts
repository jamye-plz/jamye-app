type FileSystemModule = { readFileSync: (path: string) => Uint8Array };
type PathModule = { join: (...parts: string[]) => string };
type ZlibModule = { inflateSync: (data: Uint8Array) => Uint8Array };

const { readFileSync } = jest.requireActual<FileSystemModule>("node:fs");
const { join } = jest.requireActual<PathModule>("node:path");
const { inflateSync } = jest.requireActual<ZlibModule>("node:zlib");

const BRAND_DIR = join(process.cwd(), "assets/brand");
const SCALES = ["", "@2x", "@3x"] as const;

type Rgba = readonly [number, number, number, number];

/** Minimal decoder for the 8-bit RGBA, non-interlaced PNGs in assets/brand. */
function decodePng(path: string): {
  height: number;
  pixel: (x: number, y: number) => Rgba;
  width: number;
} {
  const data = readFileSync(path);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset < data.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      expect([body[8], body[9], body[12]]).toEqual([8, 6, 0]);
    } else if (type === "IDAT") {
      idat.push(body);
    }
    offset += 12 + length;
  }
  const compressed = new Uint8Array(
    idat.reduce((total, chunk) => total + chunk.length, 0),
  );
  idat.reduce((at, chunk) => {
    compressed.set(chunk, at);
    return at + chunk.length;
  }, 0);
  const raw = inflateSync(compressed);
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4]! : 0;
      const estimate = left + up - upLeft;
      const [a, b, c] = [
        Math.abs(estimate - left),
        Math.abs(estimate - up),
        Math.abs(estimate - upLeft),
      ];
      const paeth = a <= b && a <= c ? left : b <= c ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter]!;
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return {
    height,
    pixel: (x, y) => {
      const at = y * stride + x * 4;
      return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!, pixels[at + 3]!];
    },
    width,
  };
}

describe("login brand marks (device regression: the Kakao symbol showed on a white square and the Google G on a grey one)", () => {
  test.each(
    SCALES.flatMap((scale) => [
      `kakao/kakao-symbol${scale}.png`,
      `google/google-logo${scale}.png`,
    ]),
  )("%s has a transparent background", (file) => {
    const { height, pixel, width } = decodePng(join(BRAND_DIR, file));
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const;
    for (const [x, y] of corners) expect(pixel(x, y)[3]).toBe(0);
    // The old backing squares: opaque white (Kakao) and #F2F2F2 (Google).
    // Neither mark has a light neutral colour of its own.
    let backing = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [r, g, b, a] = pixel(x, y);
        const light = Math.min(r, g, b) >= 200;
        const neutral = Math.max(r, g, b) - Math.min(r, g, b) <= 16;
        if (a === 255 && light && neutral) backing += 1;
      }
    }
    expect(backing).toBe(0);
  });

  test.each(SCALES.map((scale) => `kakao/kakao-symbol${scale}.png`))(
    "%s centres the symbol's bounds, like the official button artwork",
    (file) => {
      const { height, pixel, width } = decodePng(join(BRAND_DIR, file));
      const rows: number[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixel(x, y)[3] > 8) {
            rows.push(y);
            break;
          }
        }
      }
      const centre = (rows[0]! + rows[rows.length - 1]!) / 2;
      expect(Math.abs(centre - (height - 1) / 2)).toBeLessThanOrEqual(1);
    },
  );
});
