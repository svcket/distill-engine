import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import path from 'path'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')

interface EditorialEval {
    total_score?: number;
    decision?: string;
    feedback?: string;
    [key: string]: unknown;
}

export async function POST(request: Request) {
    try {
        const { sourceId } = await request.json()

        if (!sourceId) {
            return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
        }

        let currentEval: EditorialEval = {} as EditorialEval;

        // Up to 3 evaluation cycles total (Initial + max 2 revisions)
        for (let cycle = 0; cycle < 3; cycle++) {
            const { success, data, error } = await runPythonScript(
                'editorial_qa.py',
                ['--source-id', sourceId]
            )

            if (!success) {
                return NextResponse.json({ error: 'Failed to evaluate draft', details: error }, { status: 500 })
            }

            const parsedBundle = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
            currentEval = (parsedBundle?.data || parsedBundle || {}) as EditorialEval;

            const totalScore = currentEval.total_score || 0;

            // Stop loop if Acceptable (~70%+ threshold / 42 points)
            if (totalScore >= 42) {
                break;
            }

            // It's a "Revise", so if we have structural cycles left, regenerate the draft
            if (cycle < 2 && currentEval.feedback) {
                const insightsPath = path.join(EXECUTION_DIR, '.tmp', 'insights', `${sourceId}_insights.json`)
                const outlinePath = path.join(EXECUTION_DIR, '.tmp', 'outlines', `${sourceId}_outline.json`)
                const packetPath = path.join(EXECUTION_DIR, '.tmp', 'insight_packets', `${sourceId}_packet.json`)
                const briefPath = path.join(EXECUTION_DIR, '.tmp', 'briefs', `${sourceId}_brief.json`)

                // Re-run the writer in batch mode synchronously, passing feedback and brief
                await runPythonScript('writer.py', [
                    '--outline_input', outlinePath,
                    '--insights_input', insightsPath,
                    '--packet_input', packetPath,
                    '--brief_input', briefPath,
                    '--feedback', currentEval.feedback
                ])
                // Loop continues, evaluating this newly generated draft
            }
        }

        const result = currentEval || {}
        // Normalise score from 60 point scale to a 10 point scale for the UI
        if (result.total_score !== undefined) {
            result.score = parseFloat((result.total_score / 6.0).toFixed(1))
            result.rationale = `Verdict: ${result.decision}. ` + (result.feedback || "")
        }

        return NextResponse.json({ result, message: `Draft evaluated and stabilized for: ${sourceId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
