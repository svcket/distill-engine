import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { sourceId } = await request.json()
        
        if (!sourceId) {
            return NextResponse.json({ error: "Missing sourceId" }, { status: 400 })
        }

        // Run the evaluate_dqm.py script
        const { success, data, error: scriptError } = await runPythonScript<Record<string, any>>('evaluate_dqm.py', [
            '--source-id', sourceId
        ])
        
        if (success && data) {
            const result = data.result || data
            
            // Update the source record with completed state
            await prisma.source.update({
                where: { id: sourceId, userId: session.user.id },
                data: { 
                    completedStages: {
                        push: 'qa'
                    },
                    score: typeof result.total_score === 'number' ? result.total_score : undefined
                }
            })

            return NextResponse.json({ 
                message: "Draft evaluation completed", 
                status: "success",
                result: result
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
