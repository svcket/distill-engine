/* eslint-disable @typescript-eslint/no-unused-vars */
import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript, runPythonScriptStream } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const body = await request.json()
        const sourceId = body.sourceId || body.source_id || body.id
        const { type, audience, tone, language, stream = false, draftId } = body

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        const source = await prisma.source.findUnique({
            where: { id: sourceId, userId: userId }
        })

        if (!source) {
            return NextResponse.json({ error: "Source not found" }, { status: 404 })
        }

        // TRUTH CHECK: In Split Architecture, we pass relative paths. 
        // Railway scripts find their inputs in its own .tmp folder.
        const anglePath = `.tmp/angles/${sourceId}_angle.json`
        const insightsPath = `.tmp/insights/${sourceId}_insights.json`
        const packetPath = `.tmp/insight_packets/${sourceId}_packet.json`
        const briefPath = `.tmp/briefs/${sourceId}_brief.json`
        const outlinePath = `.tmp/outlines/${sourceId}_outline.json`

        // Step 1: Content Brief
        const briefArgs = ['--source-id', sourceId]
        if (type) briefArgs.push('--type', type)
        if (audience) briefArgs.push('--audience', audience)
        if (tone) briefArgs.push('--tone', tone)
        if (language) briefArgs.push('--lang', language)

        await runPythonScript('content_brief_builder.py', briefArgs)

        // Step 2: Outline
        const architectArgs = ['--angle_input', anglePath, '--insights_input', insightsPath]
        if (language) architectArgs.push('--lang', language)
        await runPythonScript('article_architect.py', architectArgs)

        // Step 3: Final Draft
        const writerArgs = [
            '--outline_input', outlinePath,
            '--insights_input', insightsPath,
            '--packet_input', packetPath,
            '--brief_input', briefPath
        ]
        if (language) writerArgs.push('--lang', language)

        // Switch to streaming mode to prevent Vercel/Next.js timeouts during the heavy writing stage
        const response = await runPythonScriptStream("writer.py", writerArgs)
        
        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json({ error: errorText }, { status: response.status })
        }

        return response

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
