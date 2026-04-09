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

    function resolveFilePath(baseDir: string, folder: string, id: string, suffix: string): string {
        const pathsToTry = [
            path.join(baseDir, folder, id, `${id}${suffix}`), // Strict
            path.join(baseDir, folder, `${id}${suffix}`),    // Shallow
            path.join(baseDir, folder, id.replace(/^spotify_/, ''), `${id.replace(/^spotify_/, '')}${suffix}`), // Stripped strict
            path.join(baseDir, folder, `${id.replace(/^spotify_/, '')}${suffix}`), // Stripped shallow
        ];

        // Also try adding spotify_ prefix if not present
        if (!id.startsWith('spotify_')) {
            pathsToTry.push(path.join(baseDir, folder, `spotify_${id}`, `spotify_${id}${suffix}`));
            pathsToTry.push(path.join(baseDir, folder, `spotify_${id}${suffix}`));
        }

        for (const p of pathsToTry) {
            if (fs.existsSync(p)) return p;
        }

        return pathsToTry[0]; // Default fallback
    }

    // Map stage IDs to their output files using the resolver
    const stageResults: Record<string, string> = {
        insights: resolveFilePath(baseDir, 'insights', sourceId, '_insights.json'),
        angle: resolveFilePath(baseDir, 'angles', sourceId, '_angle.json'),
        draft: resolveFilePath(baseDir, 'drafts', sourceId, '_draft.json'),
        packet: resolveFilePath(baseDir, 'insight_packets', sourceId, '_packet.json'),
        transcript: resolveFilePath(baseDir, 'transcripts', sourceId, '_raw.json'),
        refine: resolveFilePath(baseDir, 'refined_transcripts', sourceId, '_refined.json'),
        summary: resolveFilePath(baseDir, 'summaries', sourceId, '_summary.json'),
        qa: resolveFilePath(baseDir, 'evaluations', sourceId, '_eval.json'),
        visual: resolveFilePath(baseDir, 'visual_plans', sourceId, '_visual_plan.json'),
        socialise: resolveFilePath(baseDir, 'socialise', sourceId, '_thread.json'),
    }

    for (const [stageId, filePath] of Object.entries(stageResults)) {
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
        } else {
            // Diagnostic logging for development
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[Results API] Missing artifact for ${stageId}: ${filePath}`);
            }
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
