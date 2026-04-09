import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        extraHTTPHeaders: {
            'Accept': 'application/json',
        },
    },
    projects: [
        {
            name: 'API Tests',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    reporter: process.env.CI ? 'github' : 'list',
})
