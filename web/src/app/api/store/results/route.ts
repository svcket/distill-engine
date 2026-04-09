/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'

// Load all stage results from the .tmp directory for a given source
export async function GET(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId') || searchParams.get('source_id')

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

    // Optimized Hybrid Artifact Fetcher
    const fetchArtifact = async (bucket: string, fileName: string) => {
        // 1. Try local disk (Railway/Dev)
        const localPath = path.join(baseDir, bucket, fileName);
        if (fs.existsSync(localPath)) {
            try { return JSON.parse(fs.readFileSync(localPath, 'utf-8')); } catch { return null; }
        }

        // 2. Fallback to Supabase Storage (Vercel Prod)
        if (supabaseAdmin) {
            try {
                const { data, error } = await supabaseAdmin.storage.from(bucket).download(fileName);
                if (data && !error) {
                    const text = await data.text();
                    return JSON.parse(text);
                }
            } catch { return null; }
        }
        return null;
    }

    // Stage bucket mapping
    const bucketMap: Record<string, string> = {
        insights: 'insights',
        angle: 'angles',
        draft: 'drafts',
        packet: 'insight_packets',
        blueprint: 'outlines',
        transcript: 'transcripts',
        refine: 'refined_transcripts',
        summary: 'summaries',
        qa: 'evaluations',
        visual: 'visual_plans',
    }

    // Run parallel fetch for all stages
    const stageIds = Object.keys(bucketMap);
    await Promise.all(stageIds.map(async (stageId) => {
        const bucket = bucketMap[stageId];
        
        // Prepare filename variants for resilience
        const suffix = stageId === 'transcript' ? '_raw.json' :
                       stageId === 'refine' ? '_refined.json' :
                       stageId === 'summary' ? '_summary.json' :
                       `_${stageId === 'qa' ? 'eval' : stageId === 'blueprint' ? 'outline' : stageId}.json`;
        
        let data = await fetchArtifact(bucket, `${sourceId}${suffix}`);
        
        // Resilient fallback for naming mismatches
        if (!data) {
            const cleanId = sourceId.replace(/^spotify_/, '');
            data = await fetchArtifact(bucket, `${cleanId}${suffix}`);
            if (!data && !sourceId.startsWith('spotify_')) {
                data = await fetchArtifact(bucket, `spotify_${sourceId}${suffix}`);
            }
        }

        if (data) {
            const unwrapped = data.data || data.payload || data.result || data;
            results[stageId] = unwrapped;

            if (stageId === 'qa') {
                const score = (unwrapped as any)?.scores?.publishability || (unwrapped as any)?.publishability;
                if (score !== undefined) results.publishability = score;
            }
        }
    }));

    // Check for source metadata (Judge results)
    let meta = await fetchArtifact('sources', `${sourceId}.json`);
    if (!meta) {
        // Fallback variants for sources
        const cleanId = sourceId.replace(/^spotify_/, '');
        meta = await fetchArtifact('sources', `${cleanId}.json`);
        if (!meta) meta = await fetchArtifact('sources', `${sourceId}_metadata.json`);
    }

    if (meta) {
        const item = Array.isArray(meta) ? meta[0] : meta;
        if (item) {
            results.judge = {
                score: item.score || 5,
                title: item.title,
                channel: item.channel,
                status: "done",
                rationale: item.rationale || "Source evaluated."
            }
        }
    }

    return NextResponse.json({ results })
}
