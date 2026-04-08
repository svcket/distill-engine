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

    const { transcriptId, draftId, stream = true, type, audience, tone, language } = await request.json()

    if (!transcriptId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership
    const source = await prisma.source.findUnique({
        where: { id: transcriptId, userId }
    })

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    const sourceId = transcriptId
    const baseDir = path.resolve(process.cwd(), '../execution/.tmp')

    const resolveFilePath = (folder: string, prefix: string, suffix: string) => {
        const primary = path.join(baseDir, folder, prefix, `${sourceId}${suffix}`);
        if (fs.existsSync(primary)) return primary;
        const withoutSpotify = sourceId.replace(/^spotify_/, '');
        const alt1 = path.join(baseDir, folder, prefix, `${withoutSpotify}${suffix}`);
        if (fs.existsSync(alt1)) return alt1;
        const alt2 = path.join(baseDir, folder, prefix, `spotify_${withoutSpotify}${suffix}`);
        if (fs.existsSync(alt2)) return alt2;
        return primary;
    }

    const insightsPath = resolveFilePath('insights', '', '_insights.json')
    const anglePath = resolveFilePath('angles', '', '_angle.json')
    const outlinePath = resolveFilePath('outlines', '', '_outline.json')
    const packetPath = resolveFilePath('insight_packets', '', '_packet.json')
    const briefPath = resolveFilePath('briefs', '', '_brief.json')

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
                    if (language) briefArgs.push('--lang', language)

                    sendStatus("Building content brief...")
                    const briefResult = await runBatch('content_brief_builder.py', briefArgs)
                    if (!briefResult.success) throw new Error('Brief building failed')

                    // Step 1: Generate outline
                    const architectArgs = [
                        '--angle_input', anglePath,
                        '--insights_input', insightsPath,
                    ]
                    if (language) architectArgs.push('--lang', language)

                    sendStatus("Architecting article structure...")
                    const architectResult = await runBatch('article_architect.py', architectArgs)
                    if (!architectResult.success) {
                        console.error('Article architecture failed:', architectResult.error)
                        throw new Error(`Article architecture failed: ${architectResult.error}`)
                    }

                    // Step 2: Generate draft
                    const writerArgs = [
                        path.join(EXECUTION_DIR, 'writer.py'),
                        '--outline_input', outlinePath,
                        '--insights_input', insightsPath,
                        '--packet_input', packetPath,
                        '--brief_input', briefPath,
                        '--stream'
                    ]
                    if (language) writerArgs.push('--lang', language)

                    sendStatus("Connecting to editorial swarm...")
                    const proc = spawn(PYTHON, writerArgs, {
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
                                draftId 
                                    ? prisma.draft.update({
                                        where: { id: draftId, userId: userId },
                                        data: { content: draftContent }
                                      })
                                    : prisma.draft.create({
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
                                }),
                                prisma.source.update({
                                    where: { id: sourceId, userId: userId },
                                    data: {
                                        completedStages: {
                                            push: 'draft'
                                        }
                                    }
                                })
                            ]).catch(async () => {
                                // Fallback for string-based completedStages if push fails
                                await prisma.source.update({
                                    where: { id: sourceId, userId: userId },
                                    data: {
                                        completedStages: ['draft']
                                    }
                                })
                            })

                            // Final success signal for frontend state synchronization
                            controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'success', status: 'success', result: { content: draftContent } }) + '\n'))
                        } else {
                            const errMsg = `Draft generation failed with exit code ${code}. Please check backend logs.`;
                            controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', message: errMsg }) + '\n'));
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
    if (language) briefArgs.push('--lang', language)

    const briefResult = await runBatch('content_brief_builder.py', briefArgs, {
        expectedArtifact: `.tmp/briefs/${sourceId}_brief.json`
    })
    if (!briefResult.success) {
        return NextResponse.json({ error: 'Failed to generate Content Brief', details: briefResult.error }, { status: 500 })
    }

    const batchArchitectArgs = [
        '--angle_input', anglePath,
        '--insights_input', insightsPath,
    ]
    if (language) batchArchitectArgs.push('--lang', language)

    // Step 1: Generate outline
    const architectResult = await runBatch('article_architect.py', batchArchitectArgs, {
        expectedArtifact: `.tmp/outlines/${sourceId}_outline.json`
    })

    if (!architectResult.success) {
        return NextResponse.json({ error: 'Failed to generate outline', details: architectResult.error }, { status: 500 })
    }

    const batchWriterArgs = [
        '--outline_input', outlinePath,
        '--insights_input', insightsPath,
        '--packet_input', packetPath,
        '--brief_input', briefPath,
    ]
    if (language) batchWriterArgs.push('--lang', language)

    const { success, error, rawOutput } = await runBatch('writer.py', batchWriterArgs, {
        expectedArtifact: `.tmp/drafts/${sourceId}_draft.json`
    })

    if (!success) {
        return NextResponse.json({ error: 'Draft generation failed', details: error }, { status: 500 })
    }

    const result = JSON.parse(rawOutput || '{}')
    
    // Persist draft and update usage scoped to user
    await prisma.$transaction([
        draftId 
            ? prisma.draft.update({
                where: { id: draftId, userId: userId },
                data: { content: result.data?.content || result.content || (typeof (result.data || result) === 'string' ? (result.data || result) : JSON.stringify(result.data || result)) }
              })
            : prisma.draft.create({
                data: {
                    userId: userId,
                    title: source.title || `Draft for ${sourceId}`,
                    content: result.data?.content || result.content || (typeof (result.data || result) === 'string' ? (result.data || result) : JSON.stringify(result.data || result))
                }
            }),
        prisma.usage.upsert({
            where: { userId: userId },
            update: { draftsGenerated: { increment: 1 } },
            create: { userId: userId, draftsGenerated: 1 }
        }),
        prisma.source.update({
            where: { id: sourceId, userId: userId },
            data: {
                 completedStages: {
                    push: 'draft'
                }
            }
        })
    ]).catch(async () => {
        // Fallback for string-based completedStages if push fails
        await prisma.source.update({
            where: { id: sourceId, userId: userId },
            data: {
                completedStages: ['draft']
            }
        })
    })

    return NextResponse.json({ result: result.data || result })
}

function runBatch(script: string, args: string[], options: { expectedArtifact?: string } = {}): Promise<{ success: boolean; rawOutput?: string; error?: string }> {
    return new Promise((resolve) => {
        const proc = spawn(PYTHON, [path.join(EXECUTION_DIR, script), ...args], {
            cwd: EXECUTION_DIR,
            env: { ...process.env },
        })
        let stdout = ''; let stderr = ''
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
        proc.on('close', (code: number) => {
            if (code !== 0) {
                 resolve({ success: false, error: stderr.trim() || `Script exited with code ${code}` })
                 return
            }

            // TRUTH CHECK: Verify artifact if expected
            if (options.expectedArtifact) {
                const artifactPath = path.isAbsolute(options.expectedArtifact)
                    ? options.expectedArtifact
                    : path.join(EXECUTION_DIR, options.expectedArtifact)

                if (!fs.existsSync(artifactPath)) {
                    resolve({ success: false, error: `Pipeline Truth Error: Artifact missing at ${options.expectedArtifact}` })
                    return
                }
                if (fs.statSync(artifactPath).size === 0) {
                    resolve({ success: false, error: `Pipeline Truth Error: Artifact is empty at ${options.expectedArtifact}` })
                    return
                }
            }

            const out = stdout.trim(); const lines = out.split('\n')
            const possibleJson = [...lines].reverse().find(l => l.trim().startsWith('{') || l.trim().startsWith('['))
            resolve({ success: true, rawOutput: possibleJson || out })
        })
        proc.on('error', (err: Error) => { resolve({ success: false, error: err.message }) })
    })
}
