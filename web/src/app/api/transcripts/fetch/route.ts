import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptTranscriptResponse } from '@/lib/adapters'

export async function POST(request: Request) {
    try {
        const { url } = await request.json()

        if (!url) {
            return NextResponse.json({ error: "Missing 'url' parameter." }, { status: 400 })
        }

        const { success, error, rawOutput } = await runPythonScript("fetch_video_transcript.py", ["--url", url])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute transcript fetcher script", details: error }, { status: 500 })
        }

        const result = adaptTranscriptResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Fetched transcript for: ${url}` })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
