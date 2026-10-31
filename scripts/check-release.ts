import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const listing = JSON.parse(await readFile('release/store-listing.pl.json', 'utf8'));
assert(listing.title.length <= 30 && listing.shortDescription.length <= 80 && listing.fullDescription.length <= 4000, 'Store text exceeds Play limits');
const version = await readFile('release/android-version.properties', 'utf8');
assert(/^versionCode=[1-9][0-9]*$/m.test(version) && /^versionName=[\w.+-]+$/m.test(version), 'Invalid Android version');
for (const [name, width, height] of [['icon-512.png', 512, 512], ['feature-graphic.png', 1024, 500]] as const) {
  const meta = await sharp(`release/store-assets/${name}`).metadata(); assert.equal(meta.width, width); assert.equal(meta.height, height);
  if (name === 'feature-graphic.png') assert.equal(meta.hasAlpha, false);
}
const screenshots = (await readdir('release/store-assets')).filter((name) => /^\d\d-.*\.png$/.test(name));
assert(screenshots.length >= 2, 'At least two phone screenshots required');
for (const name of screenshots) {
  const meta = await sharp(`release/store-assets/${name}`).metadata(); assert.equal(meta.width, 1080); assert.equal(meta.height, 1920);
}
console.log(`ok   Android version, store text, icon, feature graphic and ${screenshots.length} phone screenshots`);
if (!process.argv.includes('--artifacts')) {
  const state = JSON.parse(await readFile('release/readiness.json', 'utf8'));
  const missing = ['privacyReviewed', 'smtpDeliveryVerified', 'webPagesPublished', 'playConsoleReady', 'deviceTestingDone', 'signingBackupVerified'].filter((key) => state[key] !== true);
  if (typeof state.developerName !== 'string' || state.developerName.trim().length < 2) missing.push('developerName');
  if (typeof state.supportEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.supportEmail)) missing.push('supportEmail');
  for (const key of ['privacyPolicyUrl', 'accountDeletionUrl']) {
    try { assert.equal(new URL(state[key]).protocol, 'https:'); } catch { missing.push(key); }
  }
  if ((await readFile('privacy.html', 'utf8')).includes('class="draft"')) missing.push('privacy.html is still a draft');
  if (missing.length) { console.error(`Not ready for Play publication: ${missing.join(', ')}`); process.exitCode = 1; }
  else console.log('Release checklist approved; confirm the public pages and Play Console status before upload.');
}
