import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScriptStream } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const sourceId = body.sourceId || body.source_id || body.transcriptId || body.id
        const { language } = body
        
        if (!sourceId) {
            return NextResponse.json({ error: "Missing sourceId" }, { status: 400 })
        }

        const args = ['--source-id', sourceId]
        if (language) args.push('--lang', language)

        // Switch to streaming mode to prevent Vercel/Next.js timeouts during DQM analysis
        const response = await runPythonScriptStream('evaluate_dqm.py', args)
        
        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json({ error: errorText }, { status: response.status })
        }

        return response

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Evaluate API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
