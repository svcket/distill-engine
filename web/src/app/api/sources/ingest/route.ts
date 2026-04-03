import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { url, source_type } = await request.json()

        if (!url) {
            return NextResponse.json({ error: "Missing 'url' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const args = ['--url', url, '--base-dir', executionDir, '--shell']
        if (source_type) args.push('--source-type', source_type)

        const { success, error, rawOutput } = await runPythonScript('adapters/adapter_router.py', args)

        if (!success) {
            return NextResponse.json({ error: 'Ingest failed', details: error }, { status: 500 })
        }

        const result = JSON.parse(rawOutput || '{}')
        
        // TRUTH CHECK: Verify artifact existence manually since ID was dynamic
        const artifactPath = path.resolve(executionDir, `.tmp/sources/${result.source_id}.json`)
        if (!fs.existsSync(artifactPath)) {
            return NextResponse.json({ error: 'Pipeline Truth Error: Ingest reported success but artifact is missing.', id: result.source_id }, { status: 500 })
        }
        
        const userId = session.user.id
        // SELF-HEALING: Recreate user if deleted during migration but session persists
        const userExists = await withRetry(() => prisma.user.findUnique({ where: { id: userId } }))
        if (!userExists) {
            await withRetry(() => prisma.user.create({
                data: {
                    id: userId,
                    name: session.user?.name || 'Anonymous User',
                    email: session.user?.email || '',
                    image: session.user?.image || '',
                }
            }))
        }

        // Persist the source to Postgres scoped to the user (Atomic Ownership Logic)
        let source;
        try {
            source = await withRetry(() => prisma.source.create({
                data: {
                    id: result.source_id,
                    userId: userId,
                    title: result.title || 'Unknown Source',
                    url: result.url || url,
                    type: result.source_type || 'youtube',
                    status: 'idle',
                    published: result.published || 'Recently',
                    duration: result.duration || '—',
                    score: result.score || 0,
                    completedStages: [],
                }
            }))
        } catch (err: unknown) {
            // P2002 is Prisma's code for Unique Constraint Violation
            if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
                // Verify ownership before updating
                const existing = await withRetry(() => prisma.source.findUnique({ 
                    where: { id: result.source_id } 
                }))
                
                if (existing && existing.userId !== userId) {
                    return NextResponse.json({ 
                        error: 'This source ID is already managed by another user. Collaborative sourcing is not yet supported in Beta.' 
                    }, { status: 403 })
                }

                source = await withRetry(() => prisma.source.update({
                    where: { id: result.source_id },
                    data: {
                        title: result.title || 'Unknown Source',
                        status: 'idle', 
                    }
                }))
            } else {
                throw err;
            }
        }


        // Reset usage count logic (Stage 6 prep)
        await withRetry(() => prisma.usage.upsert({
            where: { userId: userId },
            update: { sourcesProcessed: { increment: 1 } },
            create: { userId: userId, sourcesProcessed: 1 }
        }))

        // AUTOMATION: Pipeline now strictly user-triggered to avoid unintended consumption
        // Previously triggered /api/transcripts/fetch here

        return NextResponse.json({ result: source })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
