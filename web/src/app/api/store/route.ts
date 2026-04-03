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

        // Hydration fix: If a source is missing metrics or title, try to find them in the .tmp artifacts
        const hydratedSources = await Promise.all(data.map(async (s) => {
            const updates: SourceUpdate = {}
            const source = {
                ...s,
                source_type: s.type,
                completedStages: Array.isArray(s.completedStages) ? (s.completedStages as string[]) : []
            }
            
            // 1. Hydrate Title (Primary source: Transcripts/Metadata)
            if (source.title === 'Unknown Source' || !source.title || source.title === 'New Source' || source.title === 'Podcast Episode') {
                try {
                   const meta = await StorageAdapter.getJson('transcripts', `${source.id}/metadata.json`) as Record<string, string> | null
                   if (meta?.title && meta.title !== 'Unknown Source' && meta.title !== 'Podcast Episode') {
                        source.title = meta.title
                        updates.title = meta.title
                   }
                } catch { /* ignore */ }
            }

            // 2. Hydrate Duration
            if (!source.duration || source.duration === '—' || source.duration === 'PT0S') {
                try {
                    const transcriptData = await StorageAdapter.getJson('transcripts', `${source.id}/${source.id}_raw.json`) as unknown as Record<string, unknown> | Record<string, unknown>[] | null
                    if (transcriptData) {
                        let totalSecs = 0;
                        if (Array.isArray(transcriptData) && transcriptData.length > 0) {
                            const last = transcriptData[transcriptData.length - 1] as Record<string, unknown>;
                            totalSecs = ((last.start as number) || 0) + ((last.duration as number) || 0);
                        } else if (transcriptData && !Array.isArray(transcriptData)) {
                            // Extract duration from various possible JSON structures
                            const p = (transcriptData.payload || transcriptData.data || transcriptData.result || transcriptData) as { 
                                duration?: number, 
                                metadata?: { duration?: number }, 
                                result?: { duration?: number } 
                            };
                            totalSecs = p.duration || p.metadata?.duration || p.result?.duration || 0;
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
                try {
                    const evalData = await StorageAdapter.getJson('evaluations', `${source.id}_eval.json`)
                    if (evalData) {
                        const dqmPayload = (evalData.payload || evalData.data || evalData) as Record<string, any>
                        const score = dqmPayload?.scores?.publishability || dqmPayload?.publishability
                        if (score) {
                            source.score = score
                            updates.score = score
                        }
                    }
                } catch { /* ignore */ }
            }
            
            // 4. Hydrate Draft Metadata (Snippet, Word Count, Content Type)
            try {
                const draftData = await StorageAdapter.getJson('drafts', `${source.id}_draft.json`)
                if (draftData) {
                    const payload = (draftData.data || draftData.payload || draftData) as Record<string, any>
                    if (payload.content) {
                        const cleanContent = (payload.content as string).replace(/[#*`]/g, '').trim()
                        ;(source as { draftSnippet?: string }).draftSnippet = cleanContent.length > 200 ? cleanContent.substring(0, 200) + '...' : cleanContent
                    }
                    if (payload.word_count || payload.wordCount) {
                        ;(source as { wordCount?: number }).wordCount = payload.word_count || payload.wordCount
                    }
                    if (draftData.content_type || draftData.contentType || payload.contentType) {
                        ;(source as { contentType?: string }).contentType = draftData.content_type || draftData.contentType || payload.contentType
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

