import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScriptStream } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const transcriptId = body.transcriptId || body.transcript_id || body.sourceId || body.source_id || body.id
    const { language } = body
    const sourceId = transcriptId

    if (!sourceId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership (Cloud Truth)
    const source = await withRetry(() => prisma.source.findUnique({
        where: { id: sourceId, userId: session.user?.id as string }
    }))

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    try {
        const args = [
            '--source-id', sourceId,
            '--url', source.url || ""
        ]
        if (language) args.push('--lang', language)

        // Switch to streaming mode to prevent Vercel/Next.js timeouts during socialization
        const response = await runPythonScriptStream('thread_architect.py', args)
        
        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json({ error: errorText }, { status: response.status })
        }

        return response

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
