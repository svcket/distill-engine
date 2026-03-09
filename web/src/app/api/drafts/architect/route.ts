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
        const anglePath = path.join(executionDir, '.tmp', 'angles', `${transcriptId}_angle.json`)

        const { success, error, rawOutput } = await runPythonScript("article_architect.py", [
            "--angle_input", anglePath,
            "--insights_input", insightsPath
        ])

        if (!success) {
            return NextResponse.json({ error: "Failed to generate outline with LLM", details: error }, { status: 500 })
        }

        // We can reuse the JSON parsing structure
        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Architected outline for: ${transcriptId}` })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
