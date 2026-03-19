import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')
const PYTHON = process.env.PYTHON_PATH || 'python3'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    const { transcriptId, stream = true, type, audience, tone } = await request.json()

    if (!transcriptId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership
    const source = await prisma.source.findUnique({
        where: { id: transcriptId, userId: session.user.id }
    })

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    const sourceId = transcriptId
    const insightsPath = path.join(EXECUTION_DIR, '.tmp', 'insights', `${sourceId}_insights.json`)
    const anglePath = path.join(EXECUTION_DIR, '.tmp', 'angles', `${sourceId}_angle.json`)
    const outlinePath = path.join(EXECUTION_DIR, '.tmp', 'outlines', `${sourceId}_outline.json`)
    const packetPath = path.join(EXECUTION_DIR, '.tmp', 'insight_packets', `${sourceId}_packet.json`)
    const briefPath = path.join(EXECUTION_DIR, '.tmp', 'briefs', `${sourceId}_brief.json`)

    if (stream) {
        const readable = new ReadableStream({
            async start(controller) {
                const sendStatus = (text: string) => {
                    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'status', text }) + '\n'))
                }

                try {
                    // Pre-check required input files (from PREVIOUS stages)
                    const requiredFiles = [insightsPath, anglePath, packetPath];
                    for (const f of requiredFiles) {
                        if (!fs.existsSync(f)) {
                            throw new Error(`Missing prerequisite: ${path.basename(f)}. Please run preceding stages first.`);
                        }
                    }

                    // Step 0: Generate Content Brief
                    sendStatus("Initializing intelligence engine...")
                    const briefArgs = ['--source-id', sourceId]
                    if (type) briefArgs.push('--type', type)
                    if (audience) briefArgs.push('--audience', audience)
                    if (tone) briefArgs.push('--tone', tone)

                    sendStatus("Building content brief...")
                    const briefResult = await runBatch('content_brief_builder.py', briefArgs)
                    if (!briefResult.success) throw new Error('Brief building failed')

                    // Step 1: Generate outline
                    sendStatus("Architecting article structure...")
                    const architectResult = await runBatch('article_architect.py', [
                        '--angle_input', anglePath,
                        '--insights_input', insightsPath,
                    ])
                    if (!architectResult.success) {
                        console.error('Article architecture failed:', architectResult.error)
                        throw new Error(`Article architecture failed: ${architectResult.error}`)
                    }

                    // Step 2: Generate draft
                    sendStatus("Connecting to editorial swarm...")
                    const proc = spawn(PYTHON, [
                        path.join(EXECUTION_DIR, 'writer.py'),
                        '--outline_input', outlinePath,
                        '--insights_input', insightsPath,
                        '--packet_input', packetPath,
                        '--brief_input', briefPath,
                        '--stream'
                    ], {
                        cwd: EXECUTION_DIR,
                        env: { ...process.env },
                    })

                    let draftContent = ""

                    proc.stdout.on('data', (chunk: Buffer) => {
                        const rawText = chunk.toString()
                        const lines = rawText.split('\n')
                        
                        for (const line of lines) {
                            if (!line.trim()) continue
                            
                            try {
                                const parsed = JSON.parse(line)
                                if (parsed.type === 'chunk' && parsed.text) {
                                    draftContent += parsed.text
                                }
                                // Relay the parsed object directly to maintain protocol
                                controller.enqueue(new TextEncoder().encode(JSON.stringify(parsed) + '\n'))
                            } catch {
                                // If not JSON, it might be raw text or partial line, but writer.py should emit JSON lines
                                // In case of partial, we might need a buffer, but simple relay for now
                                controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'chunk', text: line }) + '\n'))
                            }
                        }
                    })
                    
                    proc.stderr.on('data', (chunk: Buffer) => {
                        const rawText = chunk.toString()
                        console.error(`[writer.py stderr]: ${rawText}`);
                        try {
                            const parsed = JSON.parse(rawText)
                            controller.enqueue(new TextEncoder().encode(JSON.stringify(parsed) + '\n'))
                        } catch {
                            // If it's a known error pattern, wrap it
                            if (rawText.toLowerCase().includes("error") || rawText.toLowerCase().includes("fail")) {
                                controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', message: rawText.trim() }) + '\n'))
                            } else {
                                // Just relay as status/log if it doesn't look like a fatal error
                                controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'status', text: `[backend]: ${rawText.trim()}` }) + '\n'))
                            }
                        }
                    })

                    proc.on('close', async (code: number) => {
                        if (code === 0) {
                            sendStatus("Finalizing draft architecture...")
                            // Persist draft and update usage
                            await prisma.$transaction([
                                prisma.draft.create({
                                    data: {
                                        userId: userId,
                                        title: source.title || `Draft for ${sourceId}`,
                                        content: draftContent
                                    }
                                }),
                                prisma.usage.upsert({
                                    where: { userId: userId },
                                    update: { draftsGenerated: { increment: 1 } },
                                    create: { userId: userId, draftsGenerated: 1 }
                                })
                            ])
                        }
                        controller.close()
                    })

                    proc.on('error', (err: Error) => {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', message: err.message }) + '\n'))
                        controller.close()
                    })
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', message }) + '\n'))
                    controller.close()
                }
            }
        })

        return new Response(readable, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
        })
    }

    // Existing batch logic...
    // Step 0: Generate Content Brief
    const briefArgs = ['--source-id', sourceId]
    if (type) briefArgs.push('--type', type)
    if (audience) briefArgs.push('--audience', audience)
    if (tone) briefArgs.push('--tone', tone)

    const briefResult = await runBatch('content_brief_builder.py', briefArgs)
    if (!briefResult.success) {
        return NextResponse.json({ error: 'Failed to generate Content Brief', details: briefResult.error }, { status: 500 })
    }

    // Step 1: Generate outline
    const architectResult = await runBatch('article_architect.py', [
        '--angle_input', anglePath,
        '--insights_input', insightsPath,
    ])

    if (!architectResult.success) {
        return NextResponse.json({ error: 'Failed to generate outline', details: architectResult.error }, { status: 500 })
    }

    const { success, error, rawOutput } = await runBatch('writer.py', [
        '--outline_input', outlinePath,
        '--insights_input', insightsPath,
        '--packet_input', packetPath,
        '--brief_input', briefPath,
    ])

    if (!success) {
        return NextResponse.json({ error: 'Draft generation failed', details: error }, { status: 500 })
    }

    const result = JSON.parse(rawOutput || '{}')
    
    // Persist draft and update usage scoped to user
    await prisma.$transaction([
        prisma.draft.create({
            data: {
                userId: userId,
                title: source.title || `Draft for ${sourceId}`,
                content: result.data || result
            }
        }),
        prisma.usage.upsert({
            where: { userId: userId },
            update: { draftsGenerated: { increment: 1 } },
            create: { userId: userId, draftsGenerated: 1 }
        })
    ])

    return NextResponse.json({ result: result.data || result })
}

function runBatch(script: string, args: string[]): Promise<{ success: boolean; rawOutput?: string; error?: string }> {
    return new Promise((resolve) => {
        const proc = spawn(PYTHON, [path.join(EXECUTION_DIR, script), ...args], {
            cwd: EXECUTION_DIR,
            env: { ...process.env },
        })
        let stdout = ''; let stderr = ''
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
        proc.on('close', (code: number) => {
            const out = stdout.trim(); const lines = out.split('\n')
            const possibleJson = [...lines].reverse().find(l => l.trim().startsWith('{') || l.trim().startsWith('['))
            resolve({ success: code === 0, rawOutput: possibleJson || out, error: stderr.trim() })
        })
        proc.on('error', (err: Error) => { resolve({ success: false, error: err.message }) })
    })
}
