/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const draftsDir = path.resolve(process.cwd(), '../execution/.tmp/drafts')

        // Fetch all sources for this user to build a Title -> SourceID map
        const userSources = await prisma.source.findMany({
            where: { userId: session.user.id },
            select: { id: true, title: true }
        })

        const sourceTitleMap = new Map<string, string>()
        for (const s of userSources) {
            if (s.title) sourceTitleMap.set(s.title.trim().toLowerCase(), s.id)
        }

        // Fetch all drafts owned by this user
        const userDrafts = await prisma.draft.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' }
        })

        if (!fs.existsSync(draftsDir)) {
            return NextResponse.json({ drafts: [] })
        }

        const drafts: any[] = []

        function decodeHtml(html: string) {
            if (!html) return html;
            return html
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ')
                .replace(/\u2013/g, '-')
                .replace(/\u2014/g, '--');
        }

        // Build a mapping from Title -> Data to handle the ID mismatch (CUID vs SourceID)
        const diskDrafts = new Map<string, any>()
        const files = fs.readdirSync(draftsDir)
        for (const file of files) {
            if (file.endsWith('_draft.json')) {
                try {
                    const raw = fs.readFileSync(path.join(draftsDir, file), 'utf-8')
                    const data = JSON.parse(raw)
                    const payload = data.data || data.payload || data
                    if (data.source_id) {
                        diskDrafts.set(data.source_id, { data, file })
                    } else if (payload.title) {
                        diskDrafts.set(payload.title.trim().toLowerCase(), { data, file })
                    }
                } catch { /* skip */ }
            }
        }

        for (const draftRecord of userDrafts) {
            const draftId = draftRecord.id
            const draftTitle = draftRecord.title?.trim().toLowerCase()
            
            // Step 1: Resolve the Source ID via Title Bridge
            const resolvedSourceId = sourceTitleMap.get(draftTitle)
            
            // Step 2: Try to find the file by Source ID (most reliable) or Draft ID
            const matchId = resolvedSourceId || draftId
            let match = diskDrafts.get(matchId)
            
            // Step 3: Last Resort - direct title match inside files
            if (!match && draftTitle) {
                match = diskDrafts.get(draftTitle)
            }

            if (match) {
                try {
                    const data = match.data
                    const sourceId = data.source_id || data.sourceId || matchId

                    // Also load format styles from angles
                    let angle = null
                    const anglePath = path.resolve(process.cwd(), `../execution/.tmp/angles/${sourceId}_angle.json`)
                    if (fs.existsSync(anglePath)) {
                        try {
                            angle = JSON.parse(fs.readFileSync(anglePath, 'utf-8'))
                        } catch { /* skip */ }
                    }

                    const formatMap: Record<string, string> = {
                        "blog_article": "Blog Post",
                        "essay": "Thematic Essay",
                        "technical_breakdown": "Technical Breakdown",
                        "explainer": "Deep Explainer",
                        "thought_leadership": "Thought Leadership",
                        "social_thread": "Twitter Thread"
                    }

                    const payload = data.data || data.payload || data
                    const rawFormat = data.contentType || data.content_type || angle?.data?.recommended_format || 'Article'
                    const displayFormat = formatMap[rawFormat] || rawFormat.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())

                    const title = decodeHtml(draftRecord.title || payload.title || 'Untitled Draft')
                    const content = payload.content || ''
                    const wordCount = payload.word_count || payload.wordCount || (content ? content.split(/\s+/).length : 0)

                    drafts.push({
                        id: draftId,
                        title,
                        content,
                        wordCount,
                        format: displayFormat,
                        status: data.status || 'success',
                        createdAt: draftRecord.createdAt.toISOString(),
                    })
                } catch (err) {
                    console.error(`Error processing draft record ${draftId}:`, err)
                }
            } else {
                // Return metadata-only if file is still not found after scan
                drafts.push({
                    id: draftId,
                    title: decodeHtml(draftRecord.title),
                    content: '',
                    wordCount: 0,
                    format: 'Article',
                    status: 'archived',
                    createdAt: draftRecord.createdAt.toISOString(),
                })
            }
        }

        // Sort by most recent
        drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return NextResponse.json({ drafts })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
