import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptInsightResponse } from '@/lib/adapters'
import path from 'path'

export async function POST(request: Request) {
    try {
        const { transcriptId } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const insightsPath = path.join(executionDir, '.tmp', 'insights', `${transcriptId}_insights.json`)

        const { success, error, rawOutput } = await runPythonScript("angle_strategist.py", ["--input", insightsPath])

        if (!success) {
            return NextResponse.json({ error: "Failed to generate angles with LLM", details: error }, { status: 500 })
        }

        // We can reuse the JSON parsing structure from adaptInsightResponse since it's standardized
        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Strategized angles for: ${transcriptId}` })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
