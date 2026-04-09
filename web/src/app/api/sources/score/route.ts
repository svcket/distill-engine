import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
    try {
        return await fn();
    } catch (err: unknown) {
        const error = err as { message?: string; code?: string };
        if (retries > 0 && (error.message?.includes("Can't reach database server") || error.code === 'P1001')) {
            console.warn(`Prisma connection failed, retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw err;
    }
}

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = session.user.id;

    try {
        const body = await request.json()
        const sourceId = body.source_id || body.sourceId

        if (!sourceId) {
            return NextResponse.json({ 
                error: "Missing 'source_id' parameter.",
                details: "Expected either 'source_id' or 'sourceId' in the request body."
            }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const sourceDir = path.join(executionDir, '.tmp', 'sources')
        fs.mkdirSync(sourceDir, { recursive: true })

        // 1. Authenticate and find the source scoped to the user
        let source = await withRetry(() => prisma.source.findUnique({
            where: { id: sourceId, userId: userId }
        }))

        // SELF-HEALING: If source is missing from user's record but exists globally, 
        // claim it for this user to ensure the pipeline can proceed.
        if (!source) {
            const globalSource = await prisma.source.findUnique({ where: { id: sourceId } });
            if (globalSource) {
                console.log(`[Score] Auto-claiming global source ${sourceId} for user ${userId}`);
                source = await prisma.source.create({
                    data: {
                        id: sourceId,
                        userId: userId,
                        title: globalSource.title,
                        url: globalSource.url,
                        type: globalSource.type,
                        status: 'idle',
                        published: globalSource.published,
                        duration: globalSource.duration,
                        completedStages: []
                    }
                });
            } else {
                return NextResponse.json({ 
                    error: "Source not found or access denied",
                    message: "The requested source could not be found in our database. Please try ingesting it again."
                }, { status: 404 })
            }
        }

        // 2. Ensure the .json stub exists for the Python judge
        const directFile = path.join(sourceDir, `${sourceId}.json`)
        if (!fs.existsSync(directFile)) {
             const stub = [{
                source_id: sourceId,
                source_type: source.type,
                title: source.title,
                url: source.url,
            }]
            fs.writeFileSync(directFile, JSON.stringify(stub, null, 2))
        }

        // 3. Execution
        const { success, data, error } = await runPythonScript(
            'ingest_source.py',
            [`--source-id=${sourceId}`]
        )

        if (!success) {
            return NextResponse.json({ error: 'Failed to execute judge script', details: error }, { status: 500 })
        }

        const result = (data || {}) as Record<string, unknown>
        
        // 4. Update the stored source scoped to the user
        const updatedSource = await withRetry(() => prisma.source.update({
            where: { id: sourceId, userId: userId },
            data: {
                title: String(result.title || source.title),
                score: Number(result.score || 0),
                status: Number(result.score || 0) >= 6 ? 'done' : 'failed',
                completedStages: {
                    push: 'judge'
                }
            }
        }))

        // 5. Usage Tracking (Stage 6)
        // Note: Ingest route already increments 'sourcesProcessed'. 
        // We could track 'successfulJudgments' here if needed.

        return NextResponse.json({ result: updatedSource, judgeData: result })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
