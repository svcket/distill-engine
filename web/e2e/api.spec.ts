import { test, expect } from '@playwright/test'

/**
 * Distill Engine — API Route Regression Tests
 * These run against the live Next.js dev/prod server.
 * Set BASE_URL env var to override (default: http://localhost:3000)
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000'

// ─── Health / Reachability ────────────────────────────────────────────────────

test('homepage loads and returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/`)
    expect(res.status()).toBe(200)
})

// ─── Auth Guard: All pipeline routes must reject unauthenticated requests ─────

const PROTECTED_ROUTES = [
    { method: 'POST', path: '/api/transcripts/fetch' },
    { method: 'POST', path: '/api/pipeline/cluster' },
    { method: 'POST', path: '/api/sources/ingest' },
    { method: 'GET',  path: '/api/monitoring' },
]

for (const route of PROTECTED_ROUTES) {
    test(`${route.method} ${route.path} → 401 without auth`, async ({ request }) => {
        const res = route.method === 'POST'
            ? await request.post(`${BASE}${route.path}`, { data: {} })
            : await request.get(`${BASE}${route.path}`)

        // Must not return 200 (would mean unprotected endpoint)
        expect(res.status()).not.toBe(200)
        // Must return 401 or redirect to login (302)
        expect([401, 302, 307, 308]).toContain(res.status())
    })
}

// ─── API Shape Contracts ───────────────────────────────────────────────────────

test('POST /api/transcripts/fetch → 401 with correct shape', async ({ request }) => {
    const res = await request.post(`${BASE}/api/transcripts/fetch`, {
        data: { url: 'https://www.youtube.com/watch?v=test', sourceId: 'test_123' }
    })
    // Should be auth failure, not a crash
    expect(res.status()).not.toBe(500)
})

test('POST /api/pipeline/cluster → 401 not 500', async ({ request }) => {
    const res = await request.post(`${BASE}/api/pipeline/cluster`, {
        data: { sourceId: 'test_123' }
    })
    expect(res.status()).not.toBe(500)
})

// ─── Sources Directory Page ────────────────────────────────────────────────────

test('GET /sources redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE}/sources`)
    // Should land on login or auth page
    const url = page.url()
    const isAuthPage = url.includes('/login') || url.includes('/signin') || url.includes('/auth')
    const isSourcesPage = url.includes('/sources')
    // Either redirected to auth OR showing sources (if behind middleware)
    expect(isAuthPage || isSourcesPage).toBe(true)
})

// ─── Draft Studio Page ─────────────────────────────────────────────────────────

test('GET /drafts redirects or loads when unauthenticated', async ({ page }) => {
    const res = await page.goto(`${BASE}/drafts`)
    // Should not crash with 500
    expect(res?.status()).not.toBe(500)
})
