export function clampImageZoom(scale: number): number {
  "worklet";
  return Number.isFinite(scale) ? Math.min(4, Math.max(1, scale)) : 1;
}

export function clampImageOffset(offset: number, size: number, scale: number) {
  "worklet";
  const limit = Math.max(0, (size * (clampImageZoom(scale) - 1)) / 2);
  return Number.isFinite(offset)
    ? Math.min(limit, Math.max(-limit, offset))
    : 0;
}
