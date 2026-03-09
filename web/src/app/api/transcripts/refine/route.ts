import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptRefinerResponse } from '@/lib/adapters'
import path from 'path'

export async function POST(request: Request) {
    try {
        const { transcriptId } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const inputPath = path.join(executionDir, '.tmp', 'transcripts', transcriptId, `${transcriptId}_raw.json`)
        const outputJson = path.join(executionDir, '.tmp', 'refined_transcripts', transcriptId, `${transcriptId}_refined.json`)

        const { success, error, rawOutput } = await runPythonScript("refine_transcript.py", ["--input", inputPath, "--output", outputJson])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute refiner script", details: error }, { status: 500 })
        }

        const result = adaptRefinerResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Refined transcript: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
