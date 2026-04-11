/* eslint-disable @typescript-eslint/no-unused-vars */
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

        const { success, error, data, rawOutput } = await runPythonScript<any>('writer.py', writerArgs)

        if (!success) {
            return NextResponse.json({ error: 'Draft generation failed', details: error }, { status: 500 })
        }

        // Parse result
        let draftContent = ""
        try {
            const result: any = data || {}
            draftContent = result.data?.content || result.content || (typeof (data || rawOutput) === 'string' ? (data || rawOutput) : JSON.stringify(data || rawOutput))
        } catch (e) {
            draftContent = String(rawOutput)
        }

        // PERSISTENCE: Save to Prisma (Supabase) instead of local disk
        const savedDraft = await prisma.$transaction([
            draftId 
                ? prisma.draft.update({
                    where: { id: draftId, userId: userId },
                    data: { content: draftContent }
                  })
                : prisma.draft.create({
                    data: {
                        userId: userId,
                        title: source.title || `Draft for ${sourceId}`,
                        content: draftContent
                    }
                }),
            prisma.usage.upsert({
                where: { userId: userId },
                update: { draftsGenerated: { increment: 1 } },
                create: { userId: userId, draftsGenerated: 1 }
            }),
            prisma.source.update({
                where: { id: sourceId, userId: userId },
                data: {
                     completedStages: {
                        push: 'draft'
                    }
                }
            })
        ])

        return NextResponse.json({ 
            success: true, 
            result: { content: draftContent },
            id: Array.isArray(savedDraft) ? savedDraft[0].id : null
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
