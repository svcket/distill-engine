import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'

export async function POST(request: Request) {
    try {
        const { transcriptId } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const inputPath = path.join(executionDir, '.tmp', 'refined_transcripts', transcriptId, `${transcriptId}_refined.json`)
        const outputMd = path.join(executionDir, '.tmp', 'summaries', transcriptId, `${transcriptId}_summary.md`)

        const { success, error, rawOutput } = await runPythonScript("transcript_summarizer.py", ["--input", inputPath, "--output", outputMd])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute summarizer script", details: error }, { status: 500 })
        }

        // Parse result from Python output
        let result: any = {}
        try {
            const lastLine = rawOutput?.trim().split('\n').pop() || "{}"
            result = JSON.parse(lastLine)
            
            // Hydration: Read the actual summary content from the JSON file
            const fs = await import('fs')
            const summaryJsonPath = path.join(executionDir, '.tmp', 'summaries', transcriptId, `${transcriptId}_summary.json`)
            if (fs.existsSync(summaryJsonPath)) {
                const rawData = fs.readFileSync(summaryJsonPath, 'utf-8')
                const parsed = JSON.parse(rawData)
                result = { ...result, summary: parsed.summary }
            }
        } catch {
            result = { summary: "" }
        }

        return NextResponse.json({ result, message: `Generated summary for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
