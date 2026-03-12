import { NextResponse } from 'next/server'
import { loadStore, upsertSource, addCompletedStage, StoredSource } from '@/lib/local-store'

export async function GET() {
    try {
        const store = loadStore()
        const sortedSources = [...store.sources].sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
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
