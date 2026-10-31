import { expect, it } from 'vitest';
import { padGeometry, padHeight } from './padLayout.ts';

it('keeps nine non-overlapping 48 px touch targets inside phone and tablet keypads', () => {
  for (const width of [296, 336, 351, 369, 480, 560]) {
    const height = padHeight(width), keys = padGeometry(width, height);
    expect(keys).toHaveLength(9);
    for (const [i, key] of keys.entries()) {
      expect(key.width).toBeGreaterThanOrEqual(48); expect(key.height).toBeGreaterThanOrEqual(48);
      expect(key.x).toBeGreaterThanOrEqual(0); expect(key.x + key.width).toBeLessThanOrEqual(width + 0.001);
      expect(key.y + key.height).toBeLessThanOrEqual(height);
      for (const other of keys.slice(i + 1)) expect(key.x + key.width <= other.x || other.x + other.width <= key.x ||
        key.y + key.height <= other.y || other.y + other.height <= key.y).toBe(true);
    }
  }
});
