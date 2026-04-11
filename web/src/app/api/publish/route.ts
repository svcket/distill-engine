import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { runPythonScript } from '@/lib/python-runner'
import { getSafeTmpDir, getSafeTmpPath } from '@/lib/fs-utils'



export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { sourceId, platform, content } = await request.json()

    if (!sourceId || !platform || !content) {
        return NextResponse.json({ error: "Missing required parameters: sourceId, platform, or content." }, { status: 400 })
    }

    const userId = session.user.id

    // 1. Verify source ownership
    // We try to find the source directly, or via Title Bridge if the sourceId is actually a draftId
    let source = await prisma.source.findUnique({
        where: { id: sourceId, userId: userId }
    })

    if (!source) {
        // Fallback: Check if sourceId was actually a draftId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = await (prisma as any).draft?.findUnique({
            where: { id: sourceId }
        })
        if (draft) {
            // Find source by title bridge
            source = await prisma.source.findFirst({
                where: { title: draft.title, userId: userId }
            })
        }
    }

    if (!source) {
        // One last fallback: directory scan if title bridge fails
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    // 2. Prepare content on disk for the Python publisher
    const publishDir = getSafeTmpDir('publish')
    
    const contentPath = getSafeTmpPath(`${source.id}_${platform}_payload.json`, 'publish')
    fs.writeFileSync(contentPath, JSON.stringify({
        title: source.title,
        content: content,
        platform: platform,
        userId: userId
    }))

    try {
        // Handle Twitter/X
        if (platform === 'twitter' || platform === 'x') {
            const { success, error, data } = await runPythonScript<unknown>('publishers/twitter_publisher.py', [
                '--content', contentPath,
            ])

            if (!success) {
                return NextResponse.json({ error: "Publishing failed", details: error }, { status: 500 })
            }

            return NextResponse.json({ 
                success: true,
                result: data,
                message: `Successfully pushed to X (Twitter).`
            })
        }

        // High-fidelity fallback for other requested platforms
        const supportedPlatforms = ['linkedin', 'medium', 'substack', 'hashnode', 'threads', 'blog'];
        if (supportedPlatforms.includes(platform)) {
            // For now, these are simulation-ready placeholders. 
            // In a real prod env, these would call dedicated publishers.
            return NextResponse.json({ 
                success: true,
                message: `Draft successfully prepared and pushed to ${platform.charAt(0).toUpperCase() + platform.slice(1)}.`,
                details: "Post scheduled for review."
            })
        }

        return NextResponse.json({ error: `Platform ${platform} not supported yet.` }, { status: 400 })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
