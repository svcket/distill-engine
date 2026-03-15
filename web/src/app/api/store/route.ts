import { NextResponse } from 'next/server'
import { loadStore, upsertSource, addCompletedStage, StoredSource } from '@/lib/local-store'

export async function GET() {
    try {
        const store = loadStore()
        const sortedSources = [...store.sources].sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })

        // Hydration fix: If a source is nameless, try to find its title in the .tmp metadata
        const path = await import('path')
        const fs = await import('fs')
        const baseDir = path.resolve(process.cwd(), '../execution/.tmp/sources')

        for (const source of sortedSources) {
            if (source.title === 'Unknown Source' || !source.title) {
                const metaPath = path.join(baseDir, `${source.id}.json`)
                if (fs.existsSync(metaPath)) {
                    try {
                        const raw = fs.readFileSync(metaPath, 'utf-8')
                        const meta = JSON.parse(raw)
                        const items = Array.isArray(meta) ? meta : [meta]
                        const item = items[0]
                        if (item.title && item.title !== 'Unknown Source') {
                            source.title = item.title
                            source.channel = item.channel || item.creator || source.channel
                        }
                    } catch { /* skip */ }
                }
            }
        }

        return NextResponse.json({ sources: sortedSources })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Save or update a source
        if (body.action === 'upsert') {
            const source = upsertSource(body.source as Partial<StoredSource> & { id: string })
            return NextResponse.json({ source })
        }

        // Mark a stage as completed
        if (body.action === 'complete_stage') {
            addCompletedStage(body.sourceId, body.stageId)
            return NextResponse.json({ success: true })
        }

        // Delete a source
        if (body.action === 'delete') {
            const { deleteSource: deleteS } = await import('@/lib/local-store')
            deleteS(body.id)
            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
