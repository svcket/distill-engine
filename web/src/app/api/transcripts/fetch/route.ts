import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptTranscriptResponse } from '@/lib/adapters'

/**
 * Transcript fetch endpoint — multi-source aware.
 * Accepts sourceId + optional sourceType and url.
 * Delegates to the appropriate adapter in transcript_harvester.py.
 */
export async function POST(request: Request) {
    try {
        const { url, sourceId, sourceType } = await request.json()

        if (!url && !sourceId) {
            return NextResponse.json({ error: "Missing 'url' or 'sourceId' parameter." }, { status: 400 })
        }

        // Build args — prefer sourceId if available, fall back to URL-derived ID
        const args: string[] = []
        if (url) args.push('--url', url)
        if (sourceId) args.push('--source-id', sourceId)
        if (sourceType) args.push('--source-type', sourceType)

        const { success, error, rawOutput } = await runPythonScript('transcript_harvester.py', args)

        if (!success) {
            return NextResponse.json({ error: 'Failed to fetch transcript', details: error }, { status: 500 })
        }

        const result = adaptTranscriptResponse(rawOutput || '')
        const raw = JSON.parse(rawOutput || '{}')

        return NextResponse.json({
            result,
            sourceId: raw.source_id,
            segmentCount: raw.segment_count || raw.chunk_count || 0,
            message: `Transcript fetched for: ${sourceId || url}`
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
