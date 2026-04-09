import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const body = await request.json()
        const sourceId = body.sourceId || body.source_id || body.transcriptId || body.id
        const { language } = body
        
        // SECURITY: Verify ownership before spawning compute-heavy worker
        const source = await withRetry(() => prisma.source.findUnique({
            where: { id: sourceId, userId }
        }))

        if (!source) {
            return NextResponse.json({ error: "Source not found or access denied." }, { status: 404 })
        }

        const args = ['--source-id', sourceId]
        if (language) args.push('--lang', language)

        // The cluster script runs Summary, Packet, and Insights in a single process
        const { success, data, error: scriptError } = await runPythonScript<{ results: Record<string, unknown> }>('run_analysis_cluster.py', args)
        
        if (success && data) {
            const result = data as unknown as Record<string, unknown>

            // ── Content Quality Gate response ────────────────────────────────
            if (result.status === 'thin_content' || result.error_type === 'THIN_CONTENT') {
                console.warn(`[Cluster API] Thin content gate triggered for ${sourceId}:`, result.error_detail)
                return NextResponse.json({
                    error: result.error_detail || "Insufficient content to analyse. Please provide a source with accessible audio or a richer description.",
                    error_type: "THIN_CONTENT",
                    status: "thin_content",
                }, { status: 422 })
            }

            // The cluster returns results for multiple stages
            const stages = ['summary', 'packet', 'insights', 'refine']
            
            // Map recovered metadata from Python payload
            const metadata = (result.metadata as Record<string, unknown>) || {}
            const updates: Record<string, unknown> = {
                completedStages: {
                    push: stages
                },
                transcriptStatus: "transcribed"
            }

            // Sync better title if recovered (Identity Recovered logic)
            if (metadata.title && metadata.title !== 'Unknown Source' && metadata.title !== 'Podcast Episode') {
                updates.title = metadata.title as string
            }
            if (metadata.duration) {
                const duration = metadata.duration as string | number
                updates.duration = typeof duration === 'number' ? duration.toString() : duration
            }
            if (metadata.channel) {
                updates.channel = metadata.channel as string
            }

            // Update the source record with completed stages and metadata
            await withRetry(() => prisma.source.update({
                where: { id: sourceId, userId },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: updates as any // Prisma data cast is fine for complex pushes
            }))

            const resultPayload = (result.results as Record<string, unknown> | undefined) ?? result
            return NextResponse.json({ 
                message: "Analysis cluster completed", 
                status: "success",
                result: resultPayload
            })
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errObj = scriptError as any
            const rawOutput = (errObj?.stdout as string) || (errObj?.rawOutput as string) || ""
            const possibleJson = rawOutput.split('\n').reverse().find((l: string) => l.trim().startsWith('{'))
            
            if (possibleJson) {
                try {
                    const rescuedData = JSON.parse(possibleJson)
                    if (rescuedData.status === 'success' || rescuedData.is_rescue) {
                        console.log("[Cluster API] Salvaging execution via JSON rescue in stderr/stdout.")
                        
                        const resultPayload = (rescuedData.results as Record<string, unknown> | undefined) ?? rescuedData
                        const stages = ['summary', 'packet', 'insights']
                        
                        // PERSISTENCE: Must update DB even during rescue so UI doesn't retry
                        await withRetry(() => prisma.source.update({
                            where: { id: sourceId, userId },
                            data: { 
                                completedStages: {
                                    push: stages
                                }
                            }
                        }))

                        return NextResponse.json({ 
                            message: "Analysis cluster completed (via rescue)", 
                            status: "success",
                            result: resultPayload
                        })
                    }
                } catch {}
            }

            console.error("[Cluster API Failure]:", scriptError)
            return NextResponse.json({ 
                error: "Analysis cluster failed", 
                details: scriptError 
            }, { status: 500 })
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Cluster API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
