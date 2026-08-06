import { defineConfig, devices } from '@playwright/test'

const MOCK_OPENAI_PORT = 4318
const APP_PORT = 3100

// E2E deliberately runs against the real (dev) Supabase project — auth, RLS,
// and storage are exercised for real. Only OpenAI is mocked (see
// tests/e2e/mock-openai-server.mjs), since real chat/extraction calls are
// slow, cost money per run, and are non-deterministic — see the "OpenAI in
// tests" decision recorded in docs/security/security-plan.md-adjacent
// project history.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false, // tests share one Supabase project; avoid cross-test interference
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node tests/e2e/mock-openai-server.mjs`,
      port: MOCK_OPENAI_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      // Production build, not `next dev`: dev mode compiles Route Handlers
      // on-demand on first hit, and a PATCH landing mid-compile was observed
      // to truncate the request body before Next's JSON parser saw it
      // (intermittent "Unexpected end of JSON input" on /api/terms/[id]).
      // Also doubles as the Stage 6 "run the production build locally" check.
      command: `npm run build && npm run start -- -p ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        OPENAI_BASE_URL: `http://127.0.0.1:${MOCK_OPENAI_PORT}/v1`,
      },
    },
  ],
})
