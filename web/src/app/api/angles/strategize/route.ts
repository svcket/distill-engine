import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptInsightResponse } from '@/lib/adapters'
import path from 'path'

export async function POST(request: Request) {
    try {
        const { transcriptId, type, audience, tone } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const insightsPath = path.join(executionDir, '.tmp', 'insights', `${transcriptId}_insights.json`)

        const args = ["--input", insightsPath]
        if (type) args.push("--type", type)
        if (audience) args.push("--audience", audience)
        if (tone) args.push("--tone", tone)

        const { success, error, rawOutput } = await runPythonScript("angle_strategist.py", args)

        if (!success) {
            return NextResponse.json({ error: "Failed to generate angles with LLM", details: error }, { status: 500 })
        }

        // We can reuse the JSON parsing structure from adaptInsightResponse since it's standardized
        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Strategized angles for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "An unknown error occurred"
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
