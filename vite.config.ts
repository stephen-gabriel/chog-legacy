/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  define: {
    // Exposed on globalThis and read via globalThis.__PRACTICE_CLOCK_OVERRIDE__
    // in src/server/service.ts so raw Node (tsx/vitest) never throws. Inlined
    // true in development/test, false in a production client bundle.
    __PRACTICE_CLOCK_OVERRIDE__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8420',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'tests/db/**'],
    setupFiles: ['tests/setup.ts'],
    css: false,
    // jsdom environments are memory- and CPU-heavy. This machine (4 logical
    // CPUs, browsers + Docker + AV resident) thrashes with parallel workers:
    // the critical-path test measured 8.5s alone but exceeded 15s when a
    // sibling worker starved it. Serial execution keeps every file inside
    // the 15s budget without hiding a hang.
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
