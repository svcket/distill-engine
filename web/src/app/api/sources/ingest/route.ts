import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'

/**
 * Unified source ingest endpoint.
 * Accepts any URL (YouTube, Vimeo, podcast, upload) and runs it through
 * the adapter router to produce a normalized source object.
 */
export async function POST(request: Request) {
    try {
        const { url, source_type } = await request.json()

        if (!url) {
            return NextResponse.json({ error: "Missing 'url' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const args = ['--url', url, '--base-dir', executionDir]
        if (source_type) args.push('--source-type', source_type)

        const { success, error, rawOutput } = await runPythonScript('adapters/adapter_router.py', args)

        if (!success) {
            return NextResponse.json({ error: 'Ingest failed', details: error }, { status: 500 })
        }

        const result = JSON.parse(rawOutput || '{}')
        return NextResponse.json({ result })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
