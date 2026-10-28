import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Expose the dev server on the local network so a phone on the same Wi-Fi can open it.
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // The native projects hold thousands of build files. Watching them is slow, and on Windows the
      // watcher's handles keep Gradle and Capacitor from deleting or moving folders there.
      ignored: ['**/android/**', '**/ios/**'],
    },
  },
  build: {
    target: 'es2022',
  },
});
