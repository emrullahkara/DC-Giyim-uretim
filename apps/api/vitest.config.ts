import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://dcgiyim:dcgiyim@localhost:5432/dcgiyim_test',
      PUBLIC_ORIGIN: 'http://localhost',
      RATE_LIMIT_FACTOR: '100',
    },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
