import { NextResponse } from 'next/server'
import path from 'path'
import { spawn } from 'child_process'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')
const PYTHON = process.env.PYTHON_PATH || 'python3'

/**
 * /api/drafts/generate — Streaming draft generation.
 * Returns a ReadableStream so the UI can render text progressively.
 * Falls back to batch mode if streaming is not requested.
 */
export async function POST(request: Request) {
    const { transcriptId, stream = true } = await request.json()

    if (!transcriptId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    const sourceId = transcriptId
    const insightsPath = path.join(EXECUTION_DIR, '.tmp', 'insights', `${sourceId}_insights.json`)
    const anglePath = path.join(EXECUTION_DIR, '.tmp', 'angles', `${sourceId}_angle.json`)
    const outlinePath = path.join(EXECUTION_DIR, '.tmp', 'outlines', `${sourceId}_outline.json`)

    // Step 1: Generate outline (batch, fast)
    const architectResult = await runBatch('article_architect.py', [
        '--angle_input', anglePath,
        '--insights_input', insightsPath,
    ])

    if (!architectResult.success) {
        return NextResponse.json(
            { error: 'Failed to generate outline', details: architectResult.error },
            { status: 500 }
        )
    }

    // Step 2: Generate draft (streaming or batch)
    if (stream) {
        const readable = new ReadableStream({
            start(controller) {
                const proc = spawn(PYTHON, [
                    path.join(EXECUTION_DIR, 'writer.py'),
                    '--outline_input', outlinePath,
                    '--insights_input', insightsPath,
                    '--stream'
                ], {
                    cwd: EXECUTION_DIR,
                    env: { ...process.env },
                })

                proc.stdout.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n').filter(Boolean)
                    for (const line of lines) {
                        try {
                            const event = JSON.parse(line)
                            controller.enqueue(new TextEncoder().encode(line + '\n'))
                        } catch { /* skip non-JSON lines */ }
                    }
                })

                proc.stderr.on('data', (err: Buffer) => {
                    console.error('[writer.py stderr]', err.toString())
                })

                proc.on('close', (code: number) => {
                    if (code !== 0) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                JSON.stringify({ type: 'error', message: 'Writer script failed' }) + '\n'
                            )
                        )
                    }
                    controller.close()
                })

                proc.on('error', (err: Error) => {
                    controller.enqueue(
                        new TextEncoder().encode(
                            JSON.stringify({ type: 'error', message: err.message }) + '\n'
                        )
                    )
                    controller.close()
                })
            }
        })

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            }
        })
    }

    // Batch fallback
    const { success, error, rawOutput } = await runBatch('writer.py', [
        '--outline_input', outlinePath,
        '--insights_input', insightsPath,
    ])

    if (!success) {
        return NextResponse.json({ error: 'Draft generation failed', details: error }, { status: 500 })
    }

    const result = JSON.parse(rawOutput || '{}')
    return NextResponse.json({ result: result.data || result, message: `Draft generated for: ${sourceId}` })
}


function runBatch(script: string, args: string[]): Promise<{ success: boolean; rawOutput?: string; error?: string }> {
    return new Promise((resolve) => {
        const proc = spawn(PYTHON, [path.join(EXECUTION_DIR, script), ...args], {
            cwd: EXECUTION_DIR,
            env: { ...process.env },
        })

        let stdout = ''
        let stderr = ''
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
        proc.on('close', (code: number) => {
            const out = stdout.trim()
            const lines = out.split('\n')
            const possibleJson = [...lines].reverse().find(l => l.trim().startsWith('{') || l.trim().startsWith('['))
            resolve({ success: code === 0, rawOutput: possibleJson || out, error: stderr.trim() })
        })
        proc.on('error', (err: Error) => {
            resolve({ success: false, error: err.message })
        })
    })
}
