import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { runPythonScript } from '@/lib/python-runner'
import { sendPushNotification } from '@/lib/one-signal'

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

    // 1. Verify source ownership with retry
    const source = await withRetry(() => prisma.source.findUnique({
        where: { id: sourceId, userId: session.user?.id as string }
    }))

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    // Find the latest draft for this source to ensure we have content to socialise
    const draft = await prisma.draft.findFirst({
        where: { userId: session.user.id, id: sourceId }, // Using id as sourceId is the draft's parent in this simplified schema
        orderBy: { createdAt: 'desc' }
    })

    function resolveFilePath(baseDir: string, dir: string, sourceId: string, suffix: string): string {
        const strictPath = path.join(baseDir, dir, `${sourceId}${suffix}`);
        if (fs.existsSync(strictPath)) return strictPath;
    
        const strippedId = sourceId.replace(/^spotify_/, '');
        const strippedPath = path.join(baseDir, dir, `${strippedId}${suffix}`);
        if (fs.existsSync(strippedPath)) return strippedPath;
    
        if (!sourceId.startsWith('spotify_')) {
            const prefixedPath = path.join(baseDir, dir, `spotify_${sourceId}${suffix}`);
            if (fs.existsSync(prefixedPath)) return prefixedPath;
        }

        const altDir = path.join(baseDir, dir, sourceId);
        const altStrictPath = path.join(altDir, `${sourceId}${suffix}`);
        if (fs.existsSync(altStrictPath)) return altStrictPath;

        const altStrippedPath = path.join(baseDir, dir, strippedId, `${strippedId}${suffix}`);
        if (fs.existsSync(altStrippedPath)) return altStrippedPath;

        const altPrefixedPath = !sourceId.startsWith('spotify_') ? path.join(baseDir, dir, `spotify_${sourceId}`, `spotify_${sourceId}${suffix}`) : '';
        if (altPrefixedPath && fs.existsSync(altPrefixedPath)) return altPrefixedPath;
        
        return strictPath; // Default fallback if none found
    }

    const draftPath = resolveFilePath(EXECUTION_DIR, '.tmp/drafts', sourceId, '_draft.json')
    const summaryPath = resolveFilePath(EXECUTION_DIR, '.tmp/summaries', sourceId, '_summary.json')
    const outputDir = path.join(EXECUTION_DIR, '.tmp', 'socialise')
    const outputPath = path.join(outputDir, `${sourceId}_thread.json`)

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    // Pre-flight check: ensure the required files exist for the Python script
    if (!fs.existsSync(draftPath)) {
        // If draft artifact is missing but we have it in DB, write it back to disk to satisfy the script
        if (draft?.content) {
            const draftsDir = path.join(EXECUTION_DIR, '.tmp', 'drafts')
            if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true })
            fs.writeFileSync(draftPath, JSON.stringify({ content: draft.content, sourceId }))
        } else {
            return NextResponse.json({ error: "No draft artifact found. Please generate a draft first." }, { status: 400 })
        }
    }

    if (!fs.existsSync(summaryPath)) {
        return NextResponse.json({ error: "No summary artifact found. Please generate a summary first." }, { status: 400 })
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

        await withRetry(() => prisma.source.update({
            where: { id: sourceId, userId: session.user?.id },
            data: { 
                status: 'done',
                completedStages: {
                    push: 'socialise'
                }
            }
        }));

        // 4. Dispatch Push Notification
        if (session.user?.id) {
            await sendPushNotification(
                session.user.id, 
                "Distillation Complete", 
                `Your analysis for "${source.title}" is ready.`,
                `${process.env.NEXT_PUBLIC_APP_URL}/sources?id=${sourceId}`
            );
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
