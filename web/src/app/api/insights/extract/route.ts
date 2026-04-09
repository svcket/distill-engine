import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const body = await request.json()
        const transcriptId = body.transcriptId || body.transcript_id || body.sourceId || body.source_id || body.id
        const { language } = body

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const scriptPath = path.join(executionDir, 'insight_extractor.py')
        const packetPath = path.join(executionDir, '.tmp', 'insight_packets', `${transcriptId}_packet.json`)

        // SECURITY: Verify ownership before spawning worker (closes ID-guessing vulnerability)
        const source = await prisma.source.findUnique({
            where: { id: transcriptId, userId }
        })

        if (!source) {
            return NextResponse.json({ error: "Source not found or access denied." }, { status: 404 })
        }

        const encoder = new TextEncoder()
        
        const stream = new ReadableStream({
            start(controller) {
                const args = [scriptPath, '--input', packetPath]
                if (language) args.push('--lang', language)
                
                const pyProcess = spawn('python3', args, {
                    cwd: executionDir,
                    env: { ...process.env, PYTHONPATH: executionDir }
                })

                pyProcess.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n')
                    for (const line of lines) {
                        if (line.trim()) {
                            controller.enqueue(encoder.encode(line + '\n'))
                        }
                    }
                })

                pyProcess.stderr.on('data', (data) => {
                    console.error(`[Insight API] Python Stderr: ${data}`)
                })

                pyProcess.on('close', async (code) => {
                    if (code !== 0) {
                        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: `Script exited with code ${code}` }) + "\n"))
                    } else {
                        // Persist stage completion on success
                        await prisma.source.update({
                            where: { id: transcriptId, userId },
                            data: {
                                completedStages: {
                                    push: 'insights'
                                }
                            }
                        })
                    }
                    controller.close()
                })
            }
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
