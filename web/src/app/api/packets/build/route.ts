import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptInsightResponse } from '@/lib/adapters'

export async function POST(request: Request) {
    try {
        const { transcriptId } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const { success, error, rawOutput } = await runPythonScript("build_insight_packet.py", [`--video-id=${transcriptId}`], {
            expectedArtifact: `.tmp/insight_packets/${transcriptId}_packet.json`
        })

        if (!success) {
            return NextResponse.json({ error: "Failed to execute packet builder", details: error }, { status: 500 })
        }

        const result = adaptInsightResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Extracted insights for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
