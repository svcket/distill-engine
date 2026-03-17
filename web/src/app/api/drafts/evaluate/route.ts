import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'
import fs from 'fs'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')

export async function POST(request: Request) {
    try {
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        // Guard: Ensure draft exists before evaluation
        const draftPath = path.join(EXECUTION_DIR, '.tmp', 'drafts', `${sourceId}_draft.json`)
        if (!fs.existsSync(draftPath)) {
            return NextResponse.json({ 
                error: "Prerequisite failure: Draft artifact missing.", 
                details: "Please generate the draft successfully before running the Matrix evaluation." 
            }, { status: 400 })
        }

        // Call the new DQM evaluator
        const { success, data, error } = await runPythonScript(
            'evaluate_dqm.py',
            [`--source-id=${sourceId}`]
        )

        if (!success) {
            return NextResponse.json({ error: 'Failed to evaluate draft via DQM', details: error }, { status: 500 })
        }

        // The script returns { status: "success", data: { scores: {...}, strengths: [...], ... } }
        const parsedBundle = typeof data === 'object' && data !== null ? data as any : {};
        const dqmData = parsedBundle?.data || parsedBundle || {};

        return NextResponse.json({ 
            result: { status: "done", payload: dqmData }, 
            message: `DQM Evaluation complete for: ${sourceId}` 
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
