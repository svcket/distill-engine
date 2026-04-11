/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma, withRetry } from '@/lib/prisma'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = session.user.id

        // TRUTH CHECK: We now pull drafts exclusively from Prisma.
        // This is much faster and reliable than scanning the filesystem.
        const userDrafts = await withRetry(() => prisma.draft.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
        }))

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

        const drafts = userDrafts.map(draft => {
            const content = draft.content || ''
            const wordCount = content.split(/\s+/).length

            return {
                id: draft.id,
                title: decodeHtml(draft.title || 'Untitled Draft'),
                content: content,
                wordCount: wordCount,
                format: 'Article', // Defaulting to article; could be enhanced with a 'type' field in the DB
                status: 'success',
                createdAt: draft.createdAt.toISOString(),
                updatedAt: draft.updatedAt.toISOString(),
            }
        })

        return NextResponse.json({ drafts })
    } catch (err: unknown) {
        console.error("[Exports API] Fetch Error:", err)
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
