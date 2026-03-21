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

    const { sourceId } = await request.json()

    if (!sourceId) {
        return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership
    const source = await prisma.source.findUnique({
        where: { id: sourceId, userId: session.user.id }
    })

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    // Find the latest draft for this source
    const draft = await prisma.draft.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' }
    })

    // Fallback to searching on disk if not in DB (common for local imports)
    const draftPath = path.join(EXECUTION_DIR, '.tmp', 'drafts', `${sourceId}_draft.json`)
    const summaryPath = path.join(EXECUTION_DIR, '.tmp', 'summaries', `${sourceId}_summary.json`)
    const outputDir = path.join(EXECUTION_DIR, '.tmp', 'socialise')
    const outputPath = path.join(outputDir, `${sourceId}_thread.json`)

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    let draftContent = draft?.content || ""
    let summaryContent = ""

    if (!draftContent && fs.existsSync(draftPath)) {
        const draftData = JSON.parse(fs.readFileSync(draftPath, 'utf-8'))
        draftContent = draftData.content || draftData.text || draftData.data || ""
    }

    if (fs.existsSync(summaryPath)) {
        const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
        summaryContent = summaryData.summary || summaryData.text || ""
    }

    if (!draftContent) {
        return NextResponse.json({ error: "No draft content found. Please generate a draft first." }, { status: 400 })
    }

    try {
        const result = await runBatch('thread_architect.py', [
            '--draft', draftContent,
            '--transcript', summaryContent,
            '--url', source.url || "",
            '--output', outputPath
        ])

        if (!result.success) {
            return NextResponse.json({ error: "Thread generation failed", details: result.error }, { status: 500 })
        }

        const threadData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
        return NextResponse.json({ result: threadData })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
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
            if (code !== 0) {
                 resolve({ success: false, error: stderr.trim() || `Script exited with code ${code}` })
                 return
            }
            resolve({ success: true, rawOutput: stdout.trim() })
        })
        proc.on('error', (err: Error) => { resolve({ success: false, error: err.message }) })
    })
}
