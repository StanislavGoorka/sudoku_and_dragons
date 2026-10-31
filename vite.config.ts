import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

function release(): string {
  try {
    const commit = execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
    try { execFileSync('git', ['-c', 'core.fsmonitor=false', 'diff', '--quiet', 'HEAD']); }
    catch { return `${commit}-local`; }
    return commit;
  } catch { return 'local'; }
}

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_RELEASE': JSON.stringify(release()) },
  server: {
    // Expose the dev server on the local network so a phone on the same Wi-Fi can open it.
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // The native projects hold thousands of build files. Watching them is slow, and on Windows the
      // watcher's handles keep Gradle, Capacitor and our scripts from deleting or moving folders there.
      // supabase/ is server code the dev server never serves.
      ignored: ['**/android/**', '**/ios/**', '**/supabase/**', '**/test-results/**', '**/playwright-report/**', '**/.cache/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
  },
});
