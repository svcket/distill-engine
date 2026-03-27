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

    const { sourceId, platform, content } = await request.json()

    if (!sourceId || !platform || !content) {
        return NextResponse.json({ error: "Missing required parameters: sourceId, platform, or content." }, { status: 400 })
    }

    // 1. Verify source ownership
    const source = await prisma.source.findUnique({
        where: { id: sourceId, userId: session.user.id }
    })

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    // 2. Prepare content on disk for the Python publisher
    const publishDir = path.join(EXECUTION_DIR, '.tmp', 'publish')
    if (!fs.existsSync(publishDir)) {
        fs.mkdirSync(publishDir, { recursive: true })
    }
    
    const contentPath = path.join(publishDir, `${sourceId}_${platform}_payload.json`)
    fs.writeFileSync(contentPath, JSON.stringify(content))

    try {
        if (platform === 'twitter' || platform === 'x') {
            const { success, error, data } = await runPythonScript<any>('publishers/twitter_publisher.py', [
                '--content', contentPath,
                // Add --dry-run if we want to force it, otherwise the script handles missing keys
            ])

            if (!success) {
                return NextResponse.json({ error: "Publishing failed", details: error }, { status: 500 })
            }

            return NextResponse.json({ 
                success: true,
                result: data,
                message: `Successfully pushed to ${platform}.`
            })
        }

        return NextResponse.json({ error: `Platform ${platform} not supported yet.` }, { status: 400 })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
