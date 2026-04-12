import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

interface DQMEvaluationResponse {
    status: string;
    result: {
        total_score: number;
        scores: {
            source_grounding: number;
            insight_density: number;
            humanness: number;
            clarity: number;
            structure: number;
            seo: number;
            aeo: number;
            total_score: number;
        };
        suggestions: string[];
        rationale: string;
    }
}

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const sourceId = body.sourceId || body.source_id || body.transcriptId || body.id
        const { language } = body
        
        if (!sourceId) {
            return NextResponse.json({ error: "Missing sourceId" }, { status: 400 })
        }

        const args = ['--source-id', sourceId]
        if (language) args.push('--lang', language)

            // console.log(`[Evaluate API] Evaluation success for ${sourceId}. Total Score: ${score}`)

            // Update the source record with completed state and extracted score using withRetry
            await withRetry(() => prisma.source.update({
                where: { id: sourceId, userId: session.user?.id as string },
                data: { 
                    completedStages: {
                        push: 'qa'
                    },
                    score: score
                }
            }))

            return NextResponse.json({ 
                message: "Draft evaluation completed", 
                status: "success",
                result: result,
                score: score
            })
        } else {
            console.error("[Evaluate API Failure]:", scriptError)
            return NextResponse.json({ 
                error: "Draft evaluation failed", 
                details: scriptError 
            }, { status: 500 })
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Evaluate API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
