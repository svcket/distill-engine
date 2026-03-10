import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    try {
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        const { success, data, error, rawOutput } = await runPythonScript(
            'score_draft_output.py',
            ['--source-id', sourceId]
        )

        if (!success) {
            return NextResponse.json({ error: 'Failed to evaluate draft', details: error }, { status: 500 })
        }

        const result = data || {}
        return NextResponse.json({ result, message: `Draft evaluated for: ${sourceId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
