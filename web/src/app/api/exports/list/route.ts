import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET() {
    try {
        const draftsDir = path.resolve(process.cwd(), '../execution/.tmp/drafts')

        if (!fs.existsSync(draftsDir)) {
            return NextResponse.json({ drafts: [] })
        }

        const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('_draft.json'))
        const drafts = []

        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(draftsDir, file), 'utf-8')
                const data = JSON.parse(raw)
                const sourceId = data.source_id || file.replace('_draft.json', '')

                // Also try to load the angle data for format info
                let angle = null
                const anglePath = path.resolve(process.cwd(), `../execution/.tmp/angles/${sourceId}_angle.json`)
                if (!fs.existsSync(anglePath)) {
                    // Try without _angle suffix if it didn't exist, though it shouldn't be needed with source_id
                }

                if (fs.existsSync(anglePath)) {
                    try {
                        angle = JSON.parse(fs.readFileSync(anglePath, 'utf-8'))
                    } catch { /* skip */ }
                }

                const formatMap: Record<string, string> = {
                    "blog_article": "Blog Article",
                    "essay": "Thematic Essay",
                    "technical_breakdown": "Technical Breakdown",
                    "explainer": "Explainer",
                    "thought_leadership": "Thought Leadership"
                }

                const rawFormat = data.content_type || angle?.data?.recommended_format || 'Article'
                const displayFormat = formatMap[rawFormat] || rawFormat.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())

                drafts.push({
                    id: sourceId,
                    title: data.data?.title || 'Untitled Draft',
                    content: data.data?.content || '',
                    wordCount: data.data?.word_count || 0,
                    format: displayFormat,
                    status: data.status || 'unknown',
                    createdAt: fs.statSync(path.join(draftsDir, file)).mtime.toISOString(),
                })
            } catch { /* skip malformed files */ }
        }

        // Sort by most recent
        drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        return NextResponse.json({ drafts })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
