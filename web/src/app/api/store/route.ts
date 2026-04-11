/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { deleteSourceFiles } from '@/lib/storage-utils'
import { StorageAdapter } from '@/lib/storage-adapter'

interface SourceUpdate {
    title?: string;
    duration?: string;
    score?: number;
}

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const data = await prisma.source.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        })

        // Return pure Prisma data for high-speed directory loading.
        // Responsibility for hydration is moved to the Write-time (Pipeline stages).
        return NextResponse.json({ 
            sources: data.map(s => ({
                ...s,
                source_type: s.type,
                completedStages: Array.isArray(s.completedStages) ? (s.completedStages as string[]) : []
            }))
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()

        // Save or update a source
        if (body.action === 'upsert') {
            const { id, ...data } = body.source
            const source = await prisma.source.upsert({
                where: { id },
                update: { ...data, userId: session.user.id },
                create: { id, ...data, userId: session.user.id }
            })
            return NextResponse.json({ source })
        }

        // Mark a stage as completed
        if (body.action === 'complete_stage') {
            const { sourceId, source_id, stageId } = body
            const targetId = source_id || sourceId
            
            if (!targetId) {
                return NextResponse.json({ error: "Missing 'source_id' parameter." }, { status: 400 })
            }

            const source = await prisma.source.findUnique({ where: { id: targetId } })
            
            if (source) {
                // Verify ownership or ADMIN role
                const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
                if (source.userId !== session.user.id && !isAdmin) {
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
                }

                const stages = [...(Array.isArray(source.completedStages) ? source.completedStages : [])]
                if (!stages.includes(stageId)) {
                    stages.push(stageId)
                    await prisma.source.update({
                        where: { id: targetId },
                        data: { completedStages: stages }
                    })
                }
            }
            return NextResponse.json({ success: true })
        }

        // Fetch a stage result artifact for hydration
        if (body.action === 'get_result') {
            const { sourceId, stageId } = body
            if (!sourceId || !stageId) {
                return NextResponse.json({ error: "Missing sourceId or stageId" }, { status: 400 })
            }

            try {
                // Determine the correct bucket and filename based on stageId
                let bucket = 'transcripts'
                let filename = `${sourceId}/${sourceId}_raw.json`

                if (stageId === 'summary') {
                    filename = `${sourceId}/summary.json`
                } else if (stageId === 'insights') {
                    filename = `${sourceId}/insights.json`
                } else if (stageId === 'refine') {
                    filename = `${sourceId}/refined.json`
                } else if (stageId === 'draft') {
                    bucket = 'drafts'
                    filename = `${sourceId}_draft.json`
                } else if (stageId === 'qa' || stageId === 'evaluate' || stageId === 'Analyze Matrix') {
                    bucket = 'evaluations'
                    filename = `${sourceId}_eval.json`
                } else if (stageId === 'socialise' || stageId === 'social') {
                    filename = `${sourceId}/social.json`
                }

                const result = await StorageAdapter.getJson(bucket, filename)
                if (!result) {
                    return NextResponse.json({ error: "Result artifact not found" }, { status: 404 })
                }
                return NextResponse.json({ result: (result.payload || result.data || result.result || result) })
            } catch (e) {
                console.error(`[Store API] Failed to fetch result for ${stageId} of ${sourceId}:`, e)
                return NextResponse.json({ error: "Failed to fetch result" }, { status: 500 })
            }
        }


        // Delete a source
        if (body.action === 'delete') {
            const sourceId = body.id
            const source = await prisma.source.findUnique({ where: { id: sourceId } })
            
            if (source) {
                // Verify ownership or ADMIN role
                const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
                if (source.userId !== session.user.id && !isAdmin) {
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
                }

                // 1. Delete from Prisma
                await prisma.source.delete({
                    where: { id: sourceId }
                })

                // 2. Cleanup file artifacts (Cascading Cleanup)
                // console.log(`[Store API] Triggering file cleanup for ${sourceId}`)
                deleteSourceFiles(sourceId)
            }
            
            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

