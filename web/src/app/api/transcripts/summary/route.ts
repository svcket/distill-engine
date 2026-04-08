import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const { transcriptId, language } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const inputPath = path.join(executionDir, '.tmp', 'refined_transcripts', transcriptId, `${transcriptId}_refined.json`)
        const outputMd = path.join(executionDir, '.tmp', 'summaries', transcriptId, `${transcriptId}_summary.md`)

        const args = ["--input", inputPath, "--output", outputMd]
        if (language) args.push('--lang', language)

        const { success, error, rawOutput } = await runPythonScript("transcript_summarizer.py", args, {
            expectedArtifact: `.tmp/summaries/${transcriptId}/${transcriptId}_summary.json`
        })

        if (!success) {
            return NextResponse.json({ error: "Failed to execute summarizer script", details: error }, { status: 500 })
        }

        // Parse result from Python output
        let result: { summary?: string } = { summary: "" }
        try {
            const lastLine = rawOutput?.trim().split('\n').pop() || "{}"
            const parsedOutput = JSON.parse(lastLine)
            result = { ...parsedOutput }
            
            // Hydration: Read the actual summary content from the JSON file
            const summaryJsonPath = path.join(executionDir, '.tmp', 'summaries', transcriptId, `${transcriptId}_summary.json`)
            if (fs.existsSync(summaryJsonPath)) {
                const rawData = fs.readFileSync(summaryJsonPath, 'utf-8')
                const parsed = JSON.parse(rawData)
                result = { ...result, summary: parsed.summary }
            }
        } catch {
            result = { summary: "" }
        }

        // Persist stage completion
        await prisma.source.update({
            where: { id: transcriptId, userId },
            data: {
                completedStages: {
                    push: 'summary'
                }
            }
        }).catch(() => {
            // Fallback for string-based completedStages if push fails
            return prisma.source.update({
                where: { id: transcriptId, userId },
                data: {
                    completedStages: ['summary']
                }
            })
        })

        return NextResponse.json({ result, message: `Generated summary for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
