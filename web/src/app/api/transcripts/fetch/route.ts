import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import fs from 'fs'

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
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = session.user.id

    try {
        const body = await request.json()
        const sourceId = body.sourceId || body.source_id || body.transcriptId || body.id
        const { url, sourceType, language } = body
        let activeUrl = url
        let activeSourceType = sourceType
        
        let activeTitle = ""
        
        let dbSource: import("@prisma/client").Source | null = null
        // If url is missing, try to find it in the database
        if (sourceId) {
            dbSource = await withRetry(() => prisma.source.findUnique({
                where: { id: sourceId }
            }))
            if (dbSource) {
                activeUrl = activeUrl || dbSource.url
                activeSourceType = activeSourceType || dbSource.type || 'youtube'
                activeTitle = dbSource.title || ""
            }
        }

        if (!activeUrl || !sourceId) {
            console.error("Transcription fetch failed: Missing parameters", { url: activeUrl, sourceId })
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
        }

        const args = ['--url', activeUrl, '--source-id', sourceId]
        if (activeSourceType) args.push('--source-type', activeSourceType)
        if (activeTitle) args.push('--title', activeTitle)
        if (language) args.push('--lang', language)

        // Synchronously run for direct pipeline stability
        const { success, data, error: scriptError } = await runPythonScript<StagePayload>('transcript_harvester.py', [
            ...args,
            '--max-segments', '60'
        ], {
            env: { 
                EXPECTED_DURATION: dbSource?.duration?.split(':').reduce((acc: number, time: string, index: number, arr: string[]) => {
                    const unit = Math.pow(60, arr.length - index - 1);
                    return acc + (parseInt(time) || 0) * unit;
                }, 0)?.toString() || "" 
            }
        })
        
        if (success && data) {
            // Update the source record to indicate transcription is ready
            const result = data as StagePayload
            const finalStatus = result.status === 'rescued_text' ? 'rescued_text' : 'transcribed'
            
            // Read content from the textPath if available
            let content = ""
            const textPath = result.text_path
            if (textPath && fs.existsSync(textPath)) {
                content = fs.readFileSync(textPath, 'utf-8')
            }

            // Ensure segments are present for the UI - Return more for a better experience
            if (!result.segments && result.json_path && fs.existsSync(result.json_path)) {
                try {
                    const rawJson = fs.readFileSync(result.json_path, 'utf-8')
                    result.segments = JSON.parse(rawJson)
                } catch {
                    console.error("Failed to read segments from json_path")
                }
            }

            // LOG: Successful resolution
            // console.log(`[Transcript API] Source ${sourceId} resolved as ${finalStatus}. Segments: ${result.segments?.length || 0}`)

            // Format duration as M:SS string if present
            let durationString = undefined
            if (result.duration && typeof result.duration === 'number') {
                const mins = Math.floor(result.duration / 60)
                const secs = Math.floor(result.duration % 60)
                durationString = `${mins}:${String(secs).padStart(2, '0')}`
            }

            await withRetry(() => prisma.source.update({
                where: { id: sourceId, userId: userId },
                data: { 
                    status: finalStatus,
                    transcriptStatus: finalStatus,
                    content: content || '',
                    duration: durationString || undefined,
                    title: result.title || undefined,
                    completedStages: {
                        push: 'transcript'
                    }
                }
            }))
            return NextResponse.json({ 
                message: "Transcription completed", 
                status: finalStatus,
                result: result 
            })
        } else {
            // Check if the error is a graceful "unavailable" status (e.g. Spotify DRM)
            let isGracefulUnavailable = false
            let errorDetail = (scriptError as string) || "Unknown error"
            
            try {
                const parsedError = typeof scriptError === 'string' ? JSON.parse(scriptError) : scriptError
                if (parsedError && parsedError.transcript_status === 'unavailable') {
                    isGracefulUnavailable = true
                    errorDetail = parsedError.error_detail || "Audio transcription unavailable"
                }
            } catch { /* fallback to hard failure if not parseable JSON */ }

            if (isGracefulUnavailable) {
                // Rescue: Allow pipeline to proceed with metadata instead of hard failure
                await prisma.source.update({
                    where: { id: sourceId, userId: userId },
                    data: { 
                        status: 'rescued_text',
                        transcriptStatus: 'unavailable',
                        completedStages: { push: 'transcript' }
                    }
                })
                return NextResponse.json({ 
                    message: "Transcription unavailable, proceeding with rescued metadata", 
                    status: "unavailable",
                    details: errorDetail
                })
            }

            // Hard failure for actual script crashes or network issues
            await prisma.source.update({
                where: { id: sourceId, userId: userId },
                data: { 
                    status: 'failed',
                    transcriptStatus: 'failed'
                }
            })
            // Soft failure: Return what we have instead of 500
            return NextResponse.json({ 
                error: "Transcription failed", 
                details: scriptError,
                message: "We encountered an issue fetching the full transcript. Some metadata may be missing.",
                result: { status: 'failed' }
            }, { status: 200 }) // Return 200 to allow the UI to handle it gracefully
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Transcription API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
