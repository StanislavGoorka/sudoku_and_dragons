// Build a small runtime atlas from the copied originals; no access to Downloads is needed.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { iconFiles, ICON_CELL, ICON_COLUMNS } from '../src/game/ui/iconCatalog.ts';

const entries = Object.entries(iconFiles);
const layers = await Promise.all(entries.map(async ([, file], i) => ({
  input: await sharp(`assets/vendor/kenney-game-icons/white-2x/${file}.png`)
    .resize(48, 48, { fit: 'contain', background: '#00000000' })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' }).png().toBuffer(),
  left: i % ICON_COLUMNS * ICON_CELL, top: Math.floor(i / ICON_COLUMNS) * ICON_CELL,
})));
await mkdir('assets/ui', { recursive: true });
await sharp({ create: { width: ICON_COLUMNS * ICON_CELL, height: Math.ceil(entries.length / ICON_COLUMNS) * ICON_CELL,
  channels: 4, background: '#00000000' } }).composite(layers).png({ palette: true }).toFile('assets/ui/kenney-icons.png');
console.log(`Prepared ${entries.length} Kenney icons in assets/ui/kenney-icons.png`);
