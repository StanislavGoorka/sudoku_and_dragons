// Copies src/core (without tests) into supabase/functions/duel/core, so the Edge Function runs the
// exact same rules as the game. The copy is generated (gitignored); run this before every deploy.
// Files are overwritten in place and stale ones deleted one by one: removing whole folders is
// unreliable on the exFAT drive this repo lives on.
// Usage: node scripts/bundle-function.ts   (npm run function:bundle)
import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const FROM = 'src/core';
const TO = `supabase/functions/${process.argv[2] === 'daily' ? 'daily' : 'duel'}/core`;

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)));
}

const wanted = (await filesIn(FROM)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
for (const file of wanted) {
  await mkdir(dirname(join(TO, file)), { recursive: true });
  await copyFile(join(FROM, file), join(TO, file));
}
for (const file of await filesIn(TO)) {
  if (!wanted.includes(file)) await unlink(join(TO, file));
}
console.log(`Copied ${wanted.length} files from ${FROM} to ${TO}`);
