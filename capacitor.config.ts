import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The store package name. It can still change now, but not once the app is published.
  appId: 'com.metrezz.sudokudragons',
  appName: 'Sudoku & Dragons',
  webDir: 'dist',
  backgroundColor: '#15101f',
  plugins: {
    SystemBars: {
      // On WebView 140+ the page goes edge-to-edge (index.html sets viewport-fit=cover) and
      // env(safe-area-inset-*) is correct; on older WebViews Capacitor pads the WebView itself
      // and env() reads 0. Either way the game only has to respect env(); see src/game/safeArea.ts.
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      // Light icons on the game's dark background.
      style: 'DARK',
    },
  },
};

export default config;
