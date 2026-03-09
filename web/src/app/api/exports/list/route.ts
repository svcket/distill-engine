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
                const videoId = data.video_id || file.replace('_draft.json', '')

                // Also try to load the angle data for format info
                let angle = null
                const anglePath = path.resolve(process.cwd(), `../execution/.tmp/angles/${videoId}_angle.json`)
                if (fs.existsSync(anglePath)) {
                    try {
                        angle = JSON.parse(fs.readFileSync(anglePath, 'utf-8'))
                    } catch { /* skip */ }
                }

                drafts.push({
                    id: videoId,
                    title: data.data?.title || 'Untitled Draft',
                    content: data.data?.content || '',
                    wordCount: data.data?.word_count || 0,
                    format: angle?.data?.recommended_format || 'Article',
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
