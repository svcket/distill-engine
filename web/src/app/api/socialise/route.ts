import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { runPythonScript } from '@/lib/python-runner'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { transcriptId } = await request.json()
    const sourceId = transcriptId

    if (!sourceId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership
    const source = await prisma.source.findUnique({
        where: { id: sourceId, userId: session.user.id }
    })

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    // Find the latest draft for this source to ensure we have content to socialise
    const draft = await prisma.draft.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' }
    })

    const draftPath = path.join(EXECUTION_DIR, '.tmp', 'drafts', `${sourceId}_draft.json`)
    const summaryPath = path.join(EXECUTION_DIR, '.tmp', 'summaries', sourceId, `${sourceId}_summary.json`)
    const outputDir = path.join(EXECUTION_DIR, '.tmp', 'socialise')
    const outputPath = path.join(outputDir, `${sourceId}_thread.json`)

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    // Pre-flight check: ensure the required files exist for the Python script
    // We prefer the artifacts on disk over DB content to ensure consistency with what the script expects
    if (!fs.existsSync(draftPath)) {
        // If draft artifact is missing but we have it in DB, write it back to disk to satisfy the script
        if (draft?.content) {
            const draftsDir = path.join(EXECUTION_DIR, '.tmp', 'drafts')
            if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true })
            fs.writeFileSync(draftPath, JSON.stringify({ content: draft.content, sourceId }))
        } else {
            return NextResponse.json({ error: "No draft artifact found. Please generate a draft first." }, { status: 102 })
        }
    }

    if (!fs.existsSync(summaryPath)) {
        return NextResponse.json({ error: "No summary artifact found. Please generate a summary first." }, { status: 102 })
    }

    try {
        const { success, error, data } = await runPythonScript<{
            hook: string;
            thread: string[];
            cta: string;
        }>('thread_architect.py', [
            '--draft', draftPath,
            '--transcript', summaryPath,
            '--url', source.url || "",
            '--output', outputPath
        ], {
            expectedArtifact: `.tmp/socialise/${sourceId}_thread.json`
        })

        if (!success) {
            return NextResponse.json({ error: "Thread generation failed", details: error }, { status: 500 })
        }

        return NextResponse.json({ 
            result: data,
            message: "Socialised assets generated successfully."
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
