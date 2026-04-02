import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    try {
        const { sourceId } = await request.json()
        
        if (!sourceId) {
            return NextResponse.json({ error: "Missing sourceId" }, { status: 400 })
        }

        // The cluster script runs Summary, Packet, and Insights in a single process
        const { success, data, error: scriptError } = await runPythonScript<{ results: Record<string, unknown> }>('run_analysis_cluster.py', [
            '--source-id', sourceId
        ])
        
        if (success && data) {
            const result = data.results || data
            
            // The cluster returns results for multiple stages
            const stages = ['summary', 'packet', 'insights']
            
            // Update the source record with completed stages
            await prisma.source.update({
                where: { id: sourceId, userId },
                data: { 
                    completedStages: {
                        push: stages
                    }
                }
            })

            return NextResponse.json({ 
                message: "Analysis cluster completed", 
                status: "success",
                result: result.results || result
            })
        } else {
            console.error("[Cluster API Failure]:", scriptError)
            return NextResponse.json({ 
                error: "Analysis cluster failed", 
                details: scriptError 
            }, { status: 500 })
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error("[Cluster API Error]:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
