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

        // We pass the packet path instead of just video-id since insight_extractor expects --input
        const executionDir = path.resolve(process.cwd(), '../execution')
        const packetPath = path.join(executionDir, '.tmp', 'insight_packets', `${transcriptId}_packet.json`)

        const { success, error, rawOutput } = await runPythonScript("insight_extractor.py", ["--input", packetPath])

        if (!success) {
            return NextResponse.json({ error: "Failed to extract insights with LLM", details: error }, { status: 500 })
        }

        // We can reuse adaptInsightResponse or define a new one, but let's parse the JSON directly
        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Extracted generative insights for: ${transcriptId}` })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
