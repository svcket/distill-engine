import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import path from 'path'
import { promises as fs } from 'fs'
import { deleteSourceFiles } from '@/lib/storage-utils'

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

        const hydratedSources = await Promise.all(data.map(async (s) => {
            const updates: Partial<typeof s> = {}
            const source = {
                ...s,
                source_type: s.type,
                completedStages: Array.isArray(s.completedStages) ? s.completedStages : []
            }
            
            // 1. Hydrate Title
            if (source.title === 'Unknown Source' || !source.title || source.title === 'New Source' || source.title === 'Podcast Episode') {
                const metaPath = path.join(baseDir, 'transcripts', source.id, 'metadata.json')
                try {
                    const stats = await fs.stat(metaPath).catch(() => null)
                    if (stats && stats.isFile()) {
                        const metaStr = await fs.readFile(metaPath, 'utf-8')
                        const meta = JSON.parse(metaStr)
                        if (meta.title && meta.title !== 'Unknown Source' && meta.title !== 'Podcast Episode') {
                            source.title = meta.title
                            updates.title = meta.title
                        }
                    }
                } catch { /* ignore */ }
            }

            // 2. Hydrate Duration
            if (!source.duration || source.duration === '—' || source.duration === 'PT0S') {
                const transcriptPath = path.join(baseDir, 'transcripts', source.id, `${source.id}_raw.json`)
                try {
                    const stats = await fs.stat(transcriptPath).catch(() => null)
                    if (stats && stats.isFile()) {
                        const transcriptStr = await fs.readFile(transcriptPath, 'utf-8')
                        const transcriptData = JSON.parse(transcriptStr);
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
                            const dur = h > 0 
                                ? `${h}:${String(m).padStart(2, '0')}:${String(s_val).padStart(2, '0')}`
                                : `${m}:${String(s_val).padStart(2, '0')}`;
                            source.duration = dur
                            updates.duration = dur
                        }
                    }
                } catch { /* ignore */ }
            }

            // 3. Hydrate DQM Score
            if (!source.score || source.score === 0) {
                const evalPath = path.join(baseDir, 'evaluations', `${source.id}_eval.json`)
                try {
                    const stats = await fs.stat(evalPath).catch(() => null)
                    if (stats && stats.isFile()) {
                        const evalStr = await fs.readFile(evalPath, 'utf-8')
                        const evalData = JSON.parse(evalStr)
                        const dqmPayload = evalData.payload || evalData.data || evalData
                        const score = dqmPayload?.scores?.publishability || dqmPayload?.publishability
                        if (score) {
                            source.score = score
                            updates.score = score
                        }
                    }
                } catch { /* ignore */ }
            }
            
            // 4. Hydrate Draft Metadata (Snippet, Word Count, Content Type)
            const draftPath = path.join(baseDir, 'drafts', `${source.id}_draft.json`)
            try {
                const stats = await fs.stat(draftPath).catch(() => null)
                if (stats && stats.isFile()) {
                    const draftStr = await fs.readFile(draftPath, 'utf-8')
                    const draftData = JSON.parse(draftStr)
                    const payload = draftData.data || draftData.payload || draftData
                    
                    if (payload.content) {
                        // Extract a clean snippet (approx. 200 chars)
                        const cleanContent = payload.content.replace(/[#*`]/g, '').trim()
                        ;(source as any).draftSnippet = cleanContent.length > 200 ? cleanContent.substring(0, 200) + '...' : cleanContent
                    }
                    if (payload.word_count || payload.wordCount) {
                        ;(source as any).wordCount = payload.word_count || payload.wordCount
                    }
                    if (draftData.content_type || draftData.contentType || payload.contentType) {
                        ;(source as any).contentType = draftData.content_type || draftData.contentType || payload.contentType
                    }
                }
            } catch { /* ignore */ }

            // Persistence: If we found new info, update the DB in the background
            if (Object.keys(updates).length > 0) {
                prisma.source.update({
                    where: { id: source.id },
                    data: updates
                }).catch(err => console.error(`Failed to persist hydration for ${source.id}:`, err))
            }
            
            return source
        }))

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
                // Verify ownership or ADMIN role
                const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
                if (source.userId !== session.user.id && !isAdmin) {
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
                }

                const stages = [...(Array.isArray(source.completedStages) ? source.completedStages : [])]
                if (!stages.includes(stageId)) {
                    stages.push(stageId)
                    await prisma.source.update({
                        where: { id: sourceId },
                        data: { completedStages: stages }
                    })
                }
            }
            return NextResponse.json({ success: true })
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
                console.log(`[Store API] Triggering file cleanup for ${sourceId}`)
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

