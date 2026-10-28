import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Expose the dev server on the local network so a phone on the same Wi-Fi can open it.
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
