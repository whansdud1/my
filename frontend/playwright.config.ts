import { defineConfig, devices } from '@playwright/test';

// 002-notification-system — T038 E2E 설정
// FE(9518)만 띄우고 /api/v1/* 는 테스트에서 라우트 모킹한다(백엔드·DB 불필요).
// 인프라 고정값: FE 포트 = 9518 (vite.config.ts 와 동일, strictPort).

const PORT = 9518;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
