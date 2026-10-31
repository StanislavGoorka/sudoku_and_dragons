import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

const location = process.argv[2] ?? '';
const match = /^([a-zA-Z0-9_-]+\.js):(\d+):(\d+)$/.exec(location);
assert(match, 'Usage: npm run diagnostics:resolve -- chunk-HASH.js:line:column');
const map = new TraceMap(JSON.parse(await readFile(join('artifacts/sourcemaps/assets', `${match[1]}.map`), 'utf8')));
const position = originalPositionFor(map, { line: Number(match[2]), column: Number(match[3]) - 1 });
console.log(position.source ? `${position.source}:${position.line}:${(position.column ?? 0) + 1} ${position.name ?? ''}` : 'No matching source position');
