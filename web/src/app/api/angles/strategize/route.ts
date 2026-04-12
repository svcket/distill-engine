import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript, runPythonScriptStream } from '@/lib/python-runner'
import { adaptInsightResponse } from '@/lib/adapters'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const transcriptId = body.transcriptId || body.transcript_id || body.sourceId || body.source_id || body.id
        const { type, audience, tone, language } = body

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const insightsPath = `.tmp/insights/${transcriptId}_insights.json`

        const args = ["--input", insightsPath]
        if (type) args.push("--type", type)
        if (audience) args.push("--audience", audience)
        if (tone) args.push("--tone", tone)
        if (language) args.push("--lang", language)

        // Switch to streaming mode to prevent Vercel/Next.js timeouts
        const response = await runPythonScriptStream("angle_strategist.py", args)
        
        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json({ error: errorText }, { status: response.status })
        }

        return response

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "An unknown error occurred"
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
