import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptRefinerResponse } from '@/lib/adapters'

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
        // We pass the ID and the script finds the input/output in its own .tmp folder.
        const args = ["--transcript_id", transcriptId]
        if (language) args.push('--lang', language)

        const { success, error, rawOutput } = await runPythonScript("refine_transcript.py", args)

        if (!success) {
            console.error(`[Refine API] Failed for ${transcriptId}:`, error)
            return NextResponse.json({ error: "Failed to execute refiner script", details: error }, { status: 500 })
        }

        const result = adaptRefinerResponse(rawOutput || "")

        // Persist stage completion in Supabase
        await withRetry(() => prisma.source.update({
            where: { id: transcriptId, userId },
            data: {
                completedStages: {
                    push: 'refine'
                }
            }
        })).catch(() => {
            return withRetry(() => prisma.source.update({
                where: { id: transcriptId, userId },
                data: {
                    completedStages: ['refine']
                }
            }))
        })

        return NextResponse.json({ result, message: `Refined transcript: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
