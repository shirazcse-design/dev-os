import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Node, not jsdom: integration tests call Next.js Route Handlers directly, whose
    // Request/FormData/File objects are undici-based — jsdom's own File/FormData
    // shims fail Next's webidl brand-checks despite looking structurally identical.
    // Add a `// @vitest-environment jsdom` docblock to any future test file that
    // needs real DOM globals (e.g. React Testing Library component tests).
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.d.ts'],
    },
  },
})
