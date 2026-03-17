import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // HMR connects directly to Vite (not through wrangler proxy) to avoid
    // WebSocket relay issues when developing at localhost:8788
    hmr: { port: 5173 },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/models/**', 'src/utils/**'],
      exclude: ['src/test/**']
    }
  }
});
