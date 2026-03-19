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

        // Hydration fix: If a source is missing metrics or title, try to find them in the .tmp artifacts
        const webDir = path.resolve(process.cwd())
        const baseDir = webDir.endsWith('web') 
            ? path.resolve(webDir, '../execution/.tmp')
            : path.resolve(webDir, 'execution/.tmp')

        const hydratedSources = data.map((s: any) => {
            const source = {
                ...s,
                source_type: s.type, // Map 'type' to 'source_type' for frontend consistency
                completedStages: s.completedStages ? s.completedStages.split(',') : []
            }
            
            // 1. Hydrate Title
            if (source.title === 'Unknown Source' || !source.title || source.title === 'New Source') {
                const metaPath = path.join(baseDir, 'transcripts', source.id, 'metadata.json')
                if (fs.existsSync(metaPath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                        if (meta.title && meta.title !== 'Unknown Source') {
                            source.title = meta.title
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            // 2. Hydrate Duration
            if (!source.duration || source.duration === '—') {
                const transcriptPath = path.join(baseDir, 'transcripts', source.id, `${source.id}_raw.json`)
                if (fs.existsSync(transcriptPath)) {
                    try {
                        const transcriptData = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
                        let totalSecs = 0;
                        if (Array.isArray(transcriptData) && transcriptData.length > 0) {
                            const last = transcriptData[transcriptData.length - 1];
                            totalSecs = (last.start || 0) + (last.duration || 0);
                        } else {
                            const payload = transcriptData.payload || transcriptData.data || transcriptData.result || transcriptData;
                            totalSecs = payload.duration || payload.metadata?.duration || payload.result?.duration;
                        }

                        if (totalSecs > 0) {
                            const h = Math.floor(totalSecs / 3600);
                            const m = Math.floor((totalSecs % 3600) / 60);
                            const s_val = Math.floor(totalSecs % 60);
                            source.duration = h > 0 
                                ? `${h}:${String(m).padStart(2, '0')}:${String(s_val).padStart(2, '0')}`
                                : `${m}:${String(s_val).padStart(2, '0')}`;
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            // 3. Hydrate DQM Score
            if (!source.score || source.score === 0) {
                const evalPath = path.join(baseDir, 'evaluations', `${source.id}_eval.json`)
                if (fs.existsSync(evalPath)) {
                    try {
                        const evalData = JSON.parse(fs.readFileSync(evalPath, 'utf-8'))
                        const dqmPayload = evalData.payload || evalData.data || evalData
                        const score = dqmPayload?.scores?.publishability || dqmPayload?.publishability
                        if (score) {
                            source.score = score
                        }
                    } catch (e) { /* ignore */ }
                }
            }
            
            return source
        })

        return NextResponse.json({ sources: hydratedSources })
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

