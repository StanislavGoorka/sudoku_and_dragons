/** A full-size keypad has 48 px targets. A narrow phone uses two rows; the shop has a compact preview. */
export function padHeight(width: number): number { return width < 480 ? 104 : 60; }
export function padGeometry(width: number, height: number, preview = false): { x: number; y: number; width: number; height: number }[] {
  const twoRows = width < 480 && !preview;
  const gap = twoRows ? 8 : 5, columns = twoRows ? 5 : 9;
  const w = (width - gap * (columns - 1)) / columns;
  const h = twoRows ? (height - gap) / 2 : height;
  return Array.from({ length: 9 }, (_, i) => ({ x: (i < columns ? i : i - columns + 0.5) * (w + gap),
    y: i < columns ? 0 : h + gap, width: w, height: h }));
}
