import { auth } from "@/auth";
import { prisma, withRetry } from "@/lib/prisma";
import { NextResponse } from 'next/server';
import { runPythonScript } from '@/lib/python-runner';
import { formatDuration } from '@/lib/utils';
import fs from 'fs';
import { getSafeTmpDir, getSafeTmpPath } from '@/lib/fs-utils';
import { supabaseAdmin } from '@/lib/supabase';

interface StagePayload {
    status?: string;
    segments?: Record<string, unknown>[];
    json_path?: string;
    text_path?: string;
    duration?: number;
    title?: string;
    transcript_status?: string;
    error_detail?: string;
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const body = await request.json();
        const sourceId = body.sourceId || body.source_id || body.transcriptId || body.id;
        const { url, sourceType, language } = body;
        let activeUrl = url;
        let activeSourceType = sourceType;
        let activeTitle = "";
        
        let dbSource: { url?: string; type?: string; title?: string; duration?: string } | null = null;
        
        if (sourceId) {
            dbSource = await withRetry(() => prisma.source.findUnique({
                where: { id: sourceId }
            })) as any;
            if (dbSource) {
                activeUrl = activeUrl || dbSource.url;
                activeSourceType = activeSourceType || dbSource.type || 'youtube';
                activeTitle = dbSource.title || "";
            }
        }

        if (!activeUrl || !sourceId) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const args = ['--url', activeUrl, '--source-id', sourceId];
        if (activeSourceType) args.push('--source-type', activeSourceType);
        if (activeTitle) args.push('--title', activeTitle);
        if (language) args.push('--lang', language);

        const { success, data, error: scriptError } = await runPythonScript<StagePayload>('transcript_harvester.py', [
            ...args,
            '--max-segments', '60'
        ], {
            env: { 
                EXPECTED_DURATION: (dbSource?.duration || "").split(':').reduce((acc: number, time: string, index: number, arr: string[]) => {
                    const unit = Math.pow(60, arr.length - index - 1);
                    return acc + (parseInt(time) || 0) * unit;
                }, 0)?.toString() || "" 
            }
        });
        
        if (success && data) {
            const result = data as StagePayload;
            const finalStatus = result.status === 'rescued_text' ? 'rescued_text' : 'transcribed';
            
            let content = "";
            const textPath = result.text_path;
            if (textPath && fs.existsSync(textPath)) {
                content = fs.readFileSync(textPath, 'utf-8');
            }

            if (!result.segments && result.json_path && fs.existsSync(result.json_path)) {
                try {
                    const rawJson = fs.readFileSync(result.json_path, 'utf-8');
                    result.segments = JSON.parse(rawJson);
                } catch (e) {
                    console.error("Segments parse failed");
                }
            }

            let durationString = undefined;
            if (result.duration && typeof result.duration === 'number') {
                const mins = Math.floor(result.duration / 60);
                const secs = Math.floor(result.duration % 60);
                durationString = `${mins}:${String(secs).padStart(2, '0')}`;
            }

            await withRetry(() => prisma.source.update({
                where: { id: sourceId, userId: userId },
                data: { 
                    status: finalStatus,
                    transcriptStatus: finalStatus,
                    content: content || '',
                    duration: durationString || undefined,
                    title: result.title || undefined,
                    completedStages: { push: 'transcript' }
                }
            }));

            // CLOUD BRIDGE: Guarantee the file exists in Supabase for the Analysis Cluster
            // (Railway might fail to upload if it lacks keys, so Vercel does it as a backup)
            if (result.segments && result.segments.length > 0 && supabaseAdmin) {
                try {
                    const jsonString = JSON.stringify(result.segments, null, 2);
                    const { error: uploadErr } = await supabaseAdmin.storage
                        .from('transcripts')
                        .upload(`${sourceId}/${sourceId}_raw.json`, jsonString, {
                            upsert: true,
                            contentType: 'application/json'
                        });
                    if (uploadErr) console.error("[Vercel] Backup Supabase Upload Error:", uploadErr);
                    else console.log(`[Vercel] Backup Supabase Upload Success for ${sourceId}`);
                } catch (e) {
                    console.error("[Vercel] Backup Supabase Exception:", e);
                }
            }

            return NextResponse.json({ 
                message: "Transcription completed", 
                status: finalStatus,
                result: result 
            });
        } else {
            let isGracefulUnavailable = false;
            let errorDetail = (scriptError as string) || "Unknown error";
            
            try {
                const parsedError = typeof scriptError === 'string' ? JSON.parse(scriptError) : scriptError;
                if (parsedError && parsedError.transcript_status === 'unavailable') {
                    isGracefulUnavailable = true;
                    errorDetail = parsedError.error_detail || "Sourcing official episode context from metadata";
                }
            } catch (e) { /* ignored */ }

            if (isGracefulUnavailable) {
                const outDir = getSafeTmpDir(`transcripts/${sourceId}`);
                
                try {
                    if (!fs.existsSync(outDir)) {
                        fs.mkdirSync(outDir, { recursive: true });
                    }
                    
                    let finalSegments = [{ text: `[Distill Source Layer: Official Context Analysis]\n\nThis source metadata has been analyzed for contextual intelligence.`, start: 0, duration: 0 }];
                    let scriptSegments = null;
                    
                    try {
                        const parsedBody = typeof scriptError === 'string' ? JSON.parse(scriptError) : scriptError;
                        if (parsedBody && Array.isArray(parsedBody.segments)) {
                            scriptSegments = parsedBody.segments;
                        }
                    } catch (e) { /* ignored */ }

                    if (scriptSegments && scriptSegments.length > 0) {
                        finalSegments = scriptSegments;
                    }

                    const jsonPath = getSafeTmpPath(`${sourceId}_raw.json`, `transcripts/${sourceId}`);
                    const jsonString = JSON.stringify(finalSegments, null, 2);
                    
                    fs.writeFileSync(jsonPath, jsonString);
                    fs.writeFileSync(getSafeTmpPath(`${sourceId}_raw.txt`, `transcripts/${sourceId}`), finalSegments.map(s => s.text).join("\n\n"));
                    
                    if (supabaseAdmin) {
                        try {
                            const { error: uploadErr } = await supabaseAdmin.storage
                                .from('transcripts')
                                .upload(`${sourceId}/${sourceId}_raw.json`, jsonString, {
                                    upsert: true,
                                    contentType: 'application/json'
                                });
                            if (uploadErr) console.error("[Rescue] Base Supabase Upload Error:", uploadErr);
                        } catch (e) {
                            console.error("[Rescue] Base Supabase Exception:", e);
                        }
                    }
                } catch (e) {
                    console.error("[Rescue] FS Error", e);
                }

                let metadata: any = {};
                try {
                    const parsed = typeof scriptError === 'string' ? JSON.parse(scriptError) : scriptError;
                    if (parsed && typeof parsed === 'object') metadata = parsed;
                } catch (e) { /* ignored */ }

                const updateData: any = {
                    status: 'rescued_text',
                    transcriptStatus: 'unavailable',
                    completedStages: { push: 'transcript' }
                };

                if (metadata.title && metadata.title !== 'Podcast Episode' && metadata.title !== 'Unknown Source') {
                    updateData.title = metadata.title;
                }
                
                if (metadata.description || metadata.show_notes) {
                    const desc = metadata.description || metadata.show_notes;
                    const enrichedSegments = [
                        { text: `[Source Context: ${metadata.title || 'Untitled'}]\n\n${desc}`, start: 0, duration: 0 }
                    ];
                    try {
                        const enrichedJsonString = JSON.stringify(enrichedSegments, null, 2);
                        fs.writeFileSync(getSafeTmpPath(`${sourceId}_raw.json`, `transcripts/${sourceId}`), enrichedJsonString);
                        fs.writeFileSync(getSafeTmpPath(`${sourceId}_raw.txt`, `transcripts/${sourceId}`), enrichedSegments[0].text);
                        
                        if (supabaseAdmin) {
                            try {
                                const { error: uploadErr } = await supabaseAdmin.storage
                                    .from('transcripts')
                                    .upload(`${sourceId}/${sourceId}_raw.json`, enrichedJsonString, {
                                        upsert: true,
                                        contentType: 'application/json'
                                    });
                                if (uploadErr) console.error("[Rescue] Enriched Supabase Upload Error:", uploadErr);
                            } catch (e) {
                                console.error("[Rescue] Enriched Supabase Exception:", e);
                            }
                        }
                    } catch (err) {
                        console.error("[Rescue] Enrich Error", err);
                    }
                }

                if (metadata.duration) {
                    updateData.duration = formatDuration(metadata.duration);
                }

                await withRetry(() => prisma.source.update({
                    where: { id: sourceId, userId: userId },
                    data: updateData
                }));
                
                return NextResponse.json({ 
                    message: "Audio restricted by platform. Sourcing official episode context to generate intelligence.", 
                    status: "unavailable",
                    details: errorDetail
                });
            }

            await withRetry(() => prisma.source.update({
                where: { id: sourceId, userId: userId },
                data: { 
                    status: 'failed',
                    transcriptStatus: 'failed'
                }
            }));

            return NextResponse.json({ 
                error: "Transcription failed", 
                details: scriptError,
                message: "We encountered an issue fetching the full transcript.",
                result: { status: 'failed' }
            }, { status: 200 });
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error("[Transcription API Error]:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
