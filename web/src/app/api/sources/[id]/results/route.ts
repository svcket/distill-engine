import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: sourceId } = await params;

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
        summary: path.join(baseDir, 'summaries', sourceId, `${sourceId}_summary.json`),
        qa: path.join(baseDir, 'evaluations', `${sourceId}_eval.json`),
        visual: path.join(baseDir, 'visual_plans', `${sourceId}_visual_plan.json`),
        socialise: path.join(baseDir, 'socialise', `${sourceId}_thread.json`),
    }

    for (const [stageId, filePath] of Object.entries(stageFiles)) {
        if (fs.existsSync(filePath)) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8')
                results[stageId] = JSON.parse(raw)
                
                // Special handling for QA score
                if (stageId === 'qa') {
                    const data = results[stageId] as Record<string, unknown>;
                    const dqmPayload = (data.payload || data.data || data) as Record<string, unknown>;
                    const scores = dqmPayload?.scores as Record<string, unknown>;
                    const score = scores?.publishability || dqmPayload?.publishability;
                    if (score !== undefined) {
                        (results as Record<string, unknown>).publishability = score;
                    }
                }
            } catch { /* skip */ }
        }
    }

    // Check for source metadata/judge results
    const scorePath = path.join(baseDir, 'sources', `${sourceId}.json`)
    const legacyPath = path.join(baseDir, 'sources', `${sourceId}_metadata.json`)
    
    const metaPath = fs.existsSync(scorePath) ? scorePath : (fs.existsSync(legacyPath) ? legacyPath : null)

    if (metaPath) {
        try {
            const raw = fs.readFileSync(metaPath, 'utf-8')
            const meta = JSON.parse(raw)
            const items = Array.isArray(meta) ? meta : [meta]
            const item = items[0]
            if (item) {
                results.judge = { 
                    score: item.score || 5, 
                    title: item.title,
                    channel: item.channel,
                    status: "done", 
                    rationale: item.rationale || "Source evaluated." 
                }
            }
        } catch (e) { 
            console.error(`[Results API] Error parsing metadata for ${sourceId}:`, e)
        }
    }

    return NextResponse.json({ results })
}
