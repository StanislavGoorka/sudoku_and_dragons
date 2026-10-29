// Draws every dragon design (src/game/art/dragonArt.ts) side by side on the game's background, at rest
// and in the attack pose, so the art can be checked without starting the game.
// Usage: node scripts/preview-dragons.ts out.png [cell size in px, default 320]
import sharp from 'sharp';
import { DESIGNS, dragonSvg, VIEW, type Pose } from '../src/game/art/dragonArt.ts';

const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/preview-dragons.ts out.png [cell]');
const cell = Number(process.argv[3] ?? 320);

const POSES: Pose[] = [{}, { head: -0.12, jaw: -0.45, wingFront: -0.35, wingBack: -0.25, tail: 0.1 }];
const ids = Object.keys(DESIGNS);
const width = cell * ids.length;
const rowHeight = Math.round((cell * VIEW.height) / VIEW.width);
const height = rowHeight * POSES.length;

const tiles = await Promise.all(
  POSES.flatMap((pose, row) =>
    ids.map(async (id, col) => ({
      input: await sharp(Buffer.from(dragonSvg(DESIGNS[id], pose, cell))).png().toBuffer(),
      left: col * cell,
      top: row * rowHeight,
    })),
  ),
);

await sharp({ create: { width, height, channels: 4, background: '#1e1730' } })
  .composite(tiles)
  .png()
  .toFile(out);
console.log(`Wrote ${out} (${ids.join(', ')})`);
