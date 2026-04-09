import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptScoutResponse } from '@/lib/adapters'

export async function POST(request: Request) {
    try {
        const { query, max = 5 } = await request.json()

        if (!query) {
            return NextResponse.json({ error: "Missing 'query' parameter." }, { status: 400 })
        }

        // Call execution/source_scout.py
        const { success, error, rawOutput } = await runPythonScript("source_scout.py", ["--query", query, "--max", max.toString()])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute scout script", details: error }, { status: 500 })
        }

        // Convert raw script output to UI SourceCandidate[] models
        const sources = adaptScoutResponse(rawOutput || "")

        return NextResponse.json({ sources, message: `Discovered sources for: ${query}` })

    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: errorMsg }, { status: 500 })
    }
}
