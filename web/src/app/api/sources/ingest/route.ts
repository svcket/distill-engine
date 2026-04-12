import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { url, source_type, language } = await request.json()

        if (!url) {
            return NextResponse.json({ error: "Missing 'url' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const args = ['--url', url, '--base-dir', executionDir, '--shell']
        if (source_type) args.push('--source-type', source_type)
        if (language) args.push('--lang', language)

        const { success, error, rawOutput } = await runPythonScript('adapters/adapter_router.py', args)

        if (!success) {
            return NextResponse.json({ error: 'Ingest failed', details: error }, { status: 500 })
        }

        const result = JSON.parse(rawOutput || '{}')
        
        // TRUTH CHECK: In Split Architecture, we trust the Railway backend success report.
        // Artifacts are stored on the remote engine and proxied via /api/sources/[id]/results
        
        const userId = String(session.user.id)
        // Ensure user exists
        const userExists = await withRetry(() => prisma.user.findUnique({ where: { id: userId } }))
        if (!userExists) {
            await withRetry(() => prisma.user.create({
                data: {
                    id: userId,
                    name: session.user?.name || 'Pro User',
                    email: session.user?.email || '',
                    image: session.user?.image || '',
                }
            }))
        }

        const sourceId = `${userId}_${result.source_id}`;

        // Persist the source to Postgres scoped to the user (Atomic Ownership Logic)
        let source;
        try {
            source = await withRetry(() => prisma.source.create({
                data: {
                    id: sourceId,
                    userId: userId,
                    title: result.title || 'Unknown Source',
                    url: result.url || url,
                    type: result.source_type || 'youtube',
                    status: 'idle',
                    published: result.published || 'Recently',
                    duration: result.duration || '—',
                    score: result.score || 0,
                    completedStages: [],
                }
            }))
        } catch (err: unknown) {
            // Update existing record for THIS user
            const updateResult = await withRetry(() => prisma.source.updateMany({
                where: { 
                    id: sourceId,
                    userId: userId 
                },
                data: {
                    title: result.title || 'Unknown Source',
                    status: 'idle', 
                }
            }))
            
            if (updateResult.count === 0) {
                 throw err;
            }

            source = await withRetry(() => prisma.source.findUnique({ 
                where: { id: sourceId } 
            }))
        }

        // Reset usage count logic
        await withRetry(() => prisma.usage.upsert({
            where: { userId: userId },
            update: { sourcesProcessed: { increment: 1 } },
            create: { userId: userId, sourcesProcessed: 1 }
        }))

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

        // Trigger the pipeline
        const triggerPipeline = async () => {
            try {
                // Step 1: Transcription
                const fetchRes = await globalThis.fetch(`${baseUrl}/api/transcripts/fetch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
                    body: JSON.stringify({ 
                        sourceId: sourceId, 
                        url: result.url || url, 
                        sourceType: result.source_type 
                    })
                })
                
                if (fetchRes.ok) {
                    const transcriptionResult = await fetchRes.json();
                    
                    if (transcriptionResult.status === 'success' || transcriptionResult.result?.status === 'success') {
                        // Step 2 & 3: Summary and Insights
                        const summaryRes = await globalThis.fetch(`${baseUrl}/api/transcripts/summary`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
                            body: JSON.stringify({ transcriptId: sourceId })
                        })
                        if (summaryRes.ok) {
                            await globalThis.fetch(`${baseUrl}/api/insights/extract`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
                                body: JSON.stringify({ transcriptId: sourceId })
                            })
                        }
                    }
                }
            } catch (pipelineErr) {
                console.error(`[Pipeline Background ERROR] Trigger failed:`, pipelineErr)
            }
        }
        
        triggerPipeline();
        return NextResponse.json({ result: source })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Ingest API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
