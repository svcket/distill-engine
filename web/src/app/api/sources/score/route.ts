import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

/**
 * Score any source using the quality-based scoring engine.
 * Now works for all source types, not just YouTube.
 * Returns full result including rationale string for display in the UI.
 */
export async function POST(request: Request) {
    try {
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')
        const sourceDir = path.join(executionDir, '.tmp', 'sources')
        fs.mkdirSync(sourceDir, { recursive: true })

        // Ensure source metadata exists — try direct file, then scan all files
        const directFile = path.join(sourceDir, `${sourceId}.json`)
        let found = fs.existsSync(directFile)

        if (!found) {
            const existingFiles = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'))
            for (const file of existingFiles) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'))
                    const items = Array.isArray(data) ? data : [data]
                    if (items.some((item: Record<string, unknown>) =>
                        item.source_id === sourceId
                    )) {
                        found = true
                        break
                    }
                } catch { /* skip */ }
            }
        }

        // If still not found, write a minimal stub so scorer can run
        if (!found) {
            const stub = [{
                source_id: sourceId,

                source_type: 'youtube',
                title: `Source ${sourceId}`,
                channel: 'Unknown',
                duration: 'PT10M0S',
                duration_seconds: 600,
                description: '',
                transcript_status: 'unknown',
            }]
            fs.writeFileSync(
                path.join(sourceDir, `${sourceId}.json`),
                JSON.stringify(stub, null, 2)
            )
        }

        const { success, data, error, rawOutput } = await runPythonScript(
            'ingest_source.py',
            [`--source-id=${sourceId}`]
        )

        if (!success) {
            return NextResponse.json({ error: 'Failed to execute judge script', details: error }, { status: 500 })
        }

        const result = (data || {}) as any
        
        // Update the stored source with score and basic metadata
        const { upsertSource } = await import('@/lib/local-store')
        const updates: any = {
            id: sourceId,
            score: result.score || 0,
            status: result.score >= 6 ? 'done' : 'failed',
            updatedAt: new Date().toISOString()
        }
        
        // Only update title/channel if the backend actually returned them (and they aren't generic)
        if (result.title && result.title !== `Source ${sourceId}`) updates.title = result.title;
        if (result.channel && result.channel !== 'Unknown') updates.channel = result.channel;

        upsertSource(updates)

        return NextResponse.json({ result, message: `Judged source: ${sourceId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
