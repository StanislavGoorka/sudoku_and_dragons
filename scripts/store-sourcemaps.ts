// Source maps remain on this machine, outside public web/APK assets. No upload is performed.
import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const source = resolve('dist');
const target = resolve('artifacts/sourcemaps');
const entries = await readdir(source, { recursive: true, withFileTypes: true });
let count = 0;
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.map')) continue;
  const path = join(entry.parentPath, entry.name);
  const out = join(target, relative(source, path));
  await mkdir(dirname(out), { recursive: true });
  await copyFile(path, out);
  await unlink(path);
  count++;
}
console.log(`Stored ${count} source maps outside the public build`);
