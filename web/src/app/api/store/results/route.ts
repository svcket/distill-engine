/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Load all stage results from the .tmp directory for a given source
export async function GET(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId')

    if (!sourceId) {
        return NextResponse.json({ error: 'Missing sourceId' }, { status: 400 })
    }

    // Verify ownership in Prisma
    const source = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { userId: true }
    })

    if (!source) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    const isOwner = source.userId === session.user.id
    const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

    if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden: You do not own this source' }, { status: 403 })
    }

    const baseDir = path.resolve(process.cwd(), '../execution/.tmp')
    const results: Record<string, unknown> = {}

    // Helper to try multiple file naming conventions to resolve sourceId misalignment
    const resolveFilePath = (folder: string, prefix: string, suffix: string) => {
        const primary = path.join(baseDir, folder, prefix, `${sourceId}${suffix}`);
        if (fs.existsSync(primary)) return primary;

        const withoutSpotify = sourceId.replace(/^spotify_/, '');
        const alt1 = path.join(baseDir, folder, prefix, `${withoutSpotify}${suffix}`);
        if (fs.existsSync(alt1)) return alt1;

        const alt2 = path.join(baseDir, folder, prefix, `spotify_${withoutSpotify}${suffix}`);
        if (fs.existsSync(alt2)) return alt2;

        return primary; // fallback to primary if none exist for consistent error behavior
    }

    // Map stage IDs to their output files
    const resolvedFiles: Record<string, string> = {
        insights: resolveFilePath('insights', '', '_insights.json'),
        angle: resolveFilePath('angles', '', '_angle.json'),
        draft: resolveFilePath('drafts', '', '_draft.json'),
        packet: resolveFilePath('insight_packets', '', '_packet.json'),
        blueprint: resolveFilePath('outlines', '', '_outline.json'),
        transcript: resolveFilePath('transcripts', sourceId, `${sourceId}_raw.json`),
        refine: resolveFilePath('refined_transcripts', sourceId, `${sourceId}_refined.json`),
        summary: resolveFilePath('summaries', sourceId, `${sourceId}_summary.json`),
        qa: resolveFilePath('evaluations', '', '_eval.json'),
        visual: resolveFilePath('visual_plans', '', '_visual_plan.json'),
    }

    for (const [stageId, filePath] of Object.entries(resolvedFiles)) {
        if (fs.existsSync(filePath)) {
            try {
                const raw = fs.readFileSync(filePath, 'utf-8')
                const parsed = JSON.parse(raw)
                
                // Consistency wrapper: Unwrap .data or .payload if they exist to simplify consumption
                const unwrapped = parsed.data || parsed.payload || parsed.result || parsed
                results[stageId] = unwrapped

                // If it's the QA stage, try to extract a top-level publishability score for the source
                if (stageId === 'qa') {
                    const dqmPayload = unwrapped as Record<string, any>;
                    const score = dqmPayload?.scores?.publishability || dqmPayload?.publishability;
                    if (score !== undefined) {
                        (results as Record<string, any>).publishability = score;
                    }
                }
            } catch { /* skip */ }
        }
    }

    // Check for score metadata
    const scorePath = path.join(baseDir, 'sources', `${sourceId}.json`)
    if (!fs.existsSync(scorePath)) {
        // Fallback to legacy naming
        const legacyPath = path.join(baseDir, 'sources', `${sourceId}_metadata.json`)
        if (fs.existsSync(legacyPath)) {
            try {
                const raw = fs.readFileSync(legacyPath, 'utf-8')
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
                console.error(`[Results API] Error parsing legacyPath for ${sourceId}:`, e)
            }
        }
    } else {
        try {
            const raw = fs.readFileSync(scorePath, 'utf-8')
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
            console.error(`[Results API] Error parsing scorePath for ${sourceId}:`, e)
        }
    }

    return NextResponse.json({ results })
}
