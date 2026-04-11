import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const body = await request.json()
        const transcriptId = body.transcriptId || body.transcript_id || body.sourceId || body.source_id || body.id
        const { language } = body

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        // TRUTH CHECK: Passed to Railway for remote execution. 
        // Railway script is responsible for finding input/output relative to execution root.
        const args = ["--transcript_id", transcriptId]
        if (language) args.push('--lang', language)

        const { success, error, rawOutput } = await runPythonScript("transcript_summarizer.py", args)

        if (!success) {
            console.error(`[Summary API] Failed to generate summary for ${transcriptId}:`, error)
            return NextResponse.json({ error: "Failed to execute summarizer script", details: error }, { status: 500 })
        }

        // Parse result from Python output (standardized in Python scripts)
        let result: { summary?: string } = { summary: "" }
        try {
            const lines = (rawOutput || "").trim().split('\n')
            const lastLine = lines.reverse().find(l => l.trim().startsWith('{')) || "{}"
            result = JSON.parse(lastLine)
        } catch {
            console.warn(`[Summary API] Could not parse JSON output for ${transcriptId}`)
        }

        // Persist stage completion in Supabase
        await withRetry(() => prisma.source.update({
            where: { id: transcriptId, userId },
            data: {
                completedStages: {
                    push: 'summary'
                }
            }
        })).catch(() => {
            // Fallback for string-based completedStages
            return withRetry(() => prisma.source.update({
                where: { id: transcriptId, userId },
                data: {
                    completedStages: ['summary']
                }
            }))
        })

        return NextResponse.json({ result, message: `Generated summary for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
