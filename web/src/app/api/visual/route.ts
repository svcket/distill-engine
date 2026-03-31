import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { sourceId } = await req.json()
        if (!sourceId) {
            return NextResponse.json({ error: 'Missing sourceId' }, { status: 400 })
        }

        // Verify ownership in Prisma
        const source = await prisma.source.findUnique({
            where: { id: sourceId, userId: session.user.id }
        })

        const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
        if (!source && !isAdmin) {
            return NextResponse.json({ error: 'Source not found or access denied' }, { status: 404 })
        }

        const baseDir = path.resolve(process.cwd(), '../execution')
        const scriptPath = path.join(baseDir, 'visual_planner.py')
        
        return new Promise<NextResponse>((resolve) => {
            const process = spawn('python3', [scriptPath, '--source-id', sourceId, '--execute'])

            let output = ''
            let errorOutput = ''

            process.stdout.on('data', (data) => {
                output += data.toString()
            })

            process.stderr.on('data', (data) => {
                errorOutput += data.toString()
            })

            process.on('close', (code) => {
                if (code !== 0) {
                    console.error('Visual Planner script failed:', errorOutput)
                    resolve(NextResponse.json({ error: 'Visual Planning execution failed.', details: errorOutput }, { status: 500 }))
                    return
                }

                try {
                    // Try to parse the last JSON object in stdout
                    const lines = output.trim().split('\n')
                    const lastLine = lines[lines.length - 1]
                    const result = JSON.parse(lastLine)
                    resolve(NextResponse.json(result))
                } catch {
                    console.error('Failed to parse Visual Planner output:', output)
                    resolve(NextResponse.json({ error: 'Failed to parse script output.', raw: output }, { status: 500 }))
                }
            })
        })

    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
    }
}
