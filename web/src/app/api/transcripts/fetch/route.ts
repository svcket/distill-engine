import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import fs from 'fs'


export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { url, sourceId, sourceType } = await request.json()
        let activeUrl = url
        let activeSourceType = sourceType
        
        // If url is missing, try to find it in the database
        if (!activeUrl && sourceId) {
            const source = await prisma.source.findUnique({
                where: { id: sourceId }
            })
            if (source) {
                activeUrl = source.url
                activeSourceType = activeSourceType || source.type || 'youtube'
            }
        }

        if (!activeUrl || !sourceId) {
            console.error("Transcription fetch failed: Missing parameters", { url: activeUrl, sourceId })
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
        }

        const args = ['--url', activeUrl, '--source-id', sourceId]
        if (activeSourceType) args.push('--source-type', activeSourceType)

        // Synchronously run for direct pipeline stability
        const { success, data, error: scriptError } = await runPythonScript<any>('transcript_harvester.py', args)
        
        if (success && data) {
            // Update the source record to indicate transcription is ready
            const result = data
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
                    result.segments = JSON.parse(rawJson) // Return all segments, the UI handles scaling
                } catch (e) {
                    console.error("Failed to read segments from json_path", e)
                }
            }

            await (prisma.source.update as any)({
                where: { id: sourceId, userId: session.user.id },
                data: { 
                    status: finalStatus,
                    transcriptStatus: finalStatus,
                    content: content || '',
                }
            })
            return NextResponse.json({ 
                message: "Transcription completed", 
                status: finalStatus,
                result: result 
            })
        } else {
            await (prisma.source.update as any)({
                where: { id: sourceId, userId: session.user.id },
                data: { 
                    status: 'failed',
                    transcriptStatus: 'failed'
                }
            })
            return NextResponse.json({ 
                error: "Transcription failed", 
                details: scriptError,
                raw: scriptError // scriptError usually contains the stdout/stderr payload in runPythonScript failure
            }, { status: 500 })
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Transcription API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
