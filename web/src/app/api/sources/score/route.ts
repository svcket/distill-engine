import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
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
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const sourceDir = path.join(executionDir, '.tmp', 'sources')
        fs.mkdirSync(sourceDir, { recursive: true })

        // 1. Authenticate and find the source scoped to the user
        const source = await prisma.source.findUnique({
            where: { id: sourceId, userId: session.user.id }
        })

        if (!source) {
            return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
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

        const result = (data || {}) as any
        
        // 4. Update the stored source scoped to the user
        const updatedSource = await prisma.source.update({
            where: { id: sourceId, userId: session.user.id },
            data: {
                title: result.title || source.title,
                score: result.score || 0,
                status: result.score >= 6 ? 'done' : 'failed',
                completedStages: {
                    push: 'judge'
                }
            }
        })

        // 5. Usage Tracking (Stage 6)
        // Note: Ingest route already increments 'sourcesProcessed'. 
        // We could track 'successfulJudgments' here if needed.

        return NextResponse.json({ result: updatedSource, judgeData: result })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
