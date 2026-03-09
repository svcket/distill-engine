import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptJudgeResponse } from '@/lib/adapters'
import path from 'path'
import fs from 'fs'

export async function POST(request: Request) {
    try {
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        // Ensure metadata exists for this source so the scoring script can find it
        const executionDir = path.resolve(process.cwd(), '../execution')
        const sourceDir = path.join(executionDir, '.tmp', 'sources')
        fs.mkdirSync(sourceDir, { recursive: true })

        // Check if any discovery file already contains this source ID
        const existingFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'))
        let found = false
        for (const file of existingFiles) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'))
                if (Array.isArray(data) && data.some((item: Record<string, unknown>) => item.video_id === sourceId)) {
                    found = true
                    break
                }
            } catch { /* skip corrupted files */ }
        }

        // If not found, write a minimal metadata file so the scorer can process it
        if (!found) {
            const metadata = [{
                video_id: sourceId,
                title: `Source ${sourceId}`,
                channel: "unknown",
                duration: "PT10M0S",
                description: "",
                topic_matches: [],
                whitelist_match: false,
            }]
            fs.writeFileSync(
                path.join(sourceDir, `fallback_${sourceId}.json`),
                JSON.stringify(metadata, null, 2)
            )
        }

        const { success, error, rawOutput } = await runPythonScript("score_source_candidates.py", ["--video-id", sourceId])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute judge script", details: error }, { status: 500 })
        }

        // Convert raw script output to UI status
        const result = adaptJudgeResponse(rawOutput || "")

        return NextResponse.json({ result, message: `Judged source: ${sourceId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
