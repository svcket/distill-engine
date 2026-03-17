import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { url, source_type } = await request.json()

        if (!url) {
            return NextResponse.json({ error: "Missing 'url' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const args = ['--url', url, '--base-dir', executionDir, '--shell']
        if (source_type) args.push('--source-type', source_type)

        const { success, error, rawOutput } = await runPythonScript('adapters/adapter_router.py', args)

        if (!success) {
            return NextResponse.json({ error: 'Ingest failed', details: error }, { status: 500 })
        }

        const result = JSON.parse(rawOutput || '{}')
        
        // Persist the source to Postgres scoped to the user
        const source = await prisma.source.upsert({
            where: { id: result.source_id },
            update: {
                title: result.title || 'Unknown Source',
                status: 'idle', // Reset status if re-ingesting? 
            },
            create: {
                id: result.source_id,
                userId: session.user.id,
                title: result.title || 'Unknown Source',
                url: result.url || url,
                type: result.source_type || 'youtube',
                status: 'idle',
                published: result.published || 'Recently',
                duration: result.duration || '—',
                score: result.score || 0,
            }
        })


        // Reset usage count logic (Stage 6 prep)
        await prisma.usage.upsert({
            where: { userId: session.user.id },
            update: { sourcesProcessed: { increment: 1 } },
            create: { userId: session.user.id, sourcesProcessed: 1 }
        })

        // AUTOMATION: Trigger transcription auto-fetch in the background
        const transcriptFetchUrl = `${new URL(request.url).origin}/api/transcripts/fetch`
        fetch(transcriptFetchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: result.url || url, sourceId: result.source_id, sourceType: result.source_type })
        }).catch(err => console.error("Auto-transcription trigger failed:", err))

        return NextResponse.json({ result: source })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
