import { defineConfig } from 'vite';

export default defineConfig({
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
  },
});
