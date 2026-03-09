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
        const outlinePath = path.join(executionDir, '.tmp', 'outlines', `${transcriptId}_outline.json`)

        // Step 1: Generate the structural outline via article_architect.py
        const architectResult = await runPythonScript("article_architect.py", [
            "--angle_input", anglePath,
            "--insights_input", insightsPath
        ])

        if (!architectResult.success) {
            return NextResponse.json({ error: "Failed to generate outline", details: architectResult.error }, { status: 500 })
        }

        // Step 2: Generate the full draft via writer.py using the outline
        const { success, error, rawOutput } = await runPythonScript("writer.py", [
            "--outline_input", outlinePath,
            "--insights_input", insightsPath
        ])

        if (!success) {
            return NextResponse.json({ error: "Failed to generate draft with LLM", details: error }, { status: 500 })
        }

        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Draft generated for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
