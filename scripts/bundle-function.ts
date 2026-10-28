// Copies src/core (without tests) into supabase/functions/duel/core, so the Edge Function runs the
// exact same rules as the game. The copy is generated (gitignored); run this before every deploy.
// Usage: node scripts/bundle-function.ts   (npm run function:bundle)
import { cp, rm } from 'node:fs/promises';

const FROM = 'src/core';
const TO = 'supabase/functions/duel/core';

await rm(TO, { recursive: true, force: true });
await cp(FROM, TO, {
  recursive: true,
  filter: (source) => !source.endsWith('.test.ts') && !source.endsWith('tsconfig.json'),
});
console.log(`Copied ${FROM} -> ${TO}`);
