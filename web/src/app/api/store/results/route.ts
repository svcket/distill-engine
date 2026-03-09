import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

// Load all stage results from the .tmp directory for a given source
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId')

    if (!sourceId) {
        return NextResponse.json({ error: 'Missing sourceId' }, { status: 400 })
    }

    const baseDir = path.resolve(process.cwd(), '../execution/.tmp')
    const results: Record<string, unknown> = {}

    // Map stage IDs to their output files
    const stageFiles: Record<string, string> = {
        insights: path.join(baseDir, 'insights', `${sourceId}_insights.json`),
        angle: path.join(baseDir, 'angles', `${sourceId}_angle.json`),
        draft: path.join(baseDir, 'drafts', `${sourceId}_draft.json`),
        packet: path.join(baseDir, 'insight_packets', `${sourceId}_packet.json`),
        transcript: path.join(baseDir, 'transcripts', sourceId, `${sourceId}_raw.json`),
        refine: path.join(baseDir, 'refined_transcripts', sourceId, `${sourceId}_refined.json`),
    }

    for (const [stageId, filePath] of Object.entries(stageFiles)) {
        if (fs.existsSync(filePath)) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8')
                results[stageId] = JSON.parse(raw)
            } catch { /* skip */ }
        }
    }

    // Check for score metadata
    const scorePath = path.join(baseDir, 'sources', `${sourceId}_metadata.json`)
    if (fs.existsSync(scorePath)) {
        try {
            const raw = fs.readFileSync(scorePath, 'utf-8')
            const meta = JSON.parse(raw)
            results.judge = { score: meta.score || 5, status: "done", rationale: meta.rationale || "Source evaluated." }
        } catch { /* skip */ }
    }

    return NextResponse.json({ results })
}
