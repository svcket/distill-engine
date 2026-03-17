import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import path from 'path'
import fs from 'fs'

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

        const sources = data.map((s: any) => ({
            ...s,
            completedStages: s.completedStages ? s.completedStages.split(',') : []
        }))


        // Hydration fix: If a source is nameless, try to find its title in the .tmp metadata
        const baseDir = path.resolve(process.cwd(), '../execution/.tmp/sources')

        for (const source of sources) {
            if (source.title === 'Unknown Source' || !source.title) {
                const metaPath = path.join(baseDir, `${source.id}.json`)
                if (fs.existsSync(metaPath)) {
                    try {
                        const raw = fs.readFileSync(metaPath, 'utf-8')
                        const meta = JSON.parse(raw)
                        const items = Array.isArray(meta) ? meta : [meta]
                        const item = items[0]
                        if (item && item.title && item.title !== 'Unknown Source') {
                            // Local mutation for current response only
                            source.title = item.title
                        }
                    } catch (e) { 
                        console.error(`[Store API] Error hydration for ${source.id}:`, e)
                    }
                }
            }
        }

        return NextResponse.json({ sources })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
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
            const { sourceId, stageId } = body
            const source = await prisma.source.findUnique({ where: { id: sourceId } })
            if (source) {
                const stages = source.completedStages ? source.completedStages.split(',') : []
                if (!stages.includes(stageId)) {
                    stages.push(stageId)
                    await prisma.source.update({
                        where: { id: sourceId },
                        data: { completedStages: stages.join(',') }
                    })
                }
            }
            return NextResponse.json({ success: true })
        }


        // Delete a source
        if (body.action === 'delete') {
            await prisma.source.delete({
                where: { id: body.id, userId: session.user.id }
            })
            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

