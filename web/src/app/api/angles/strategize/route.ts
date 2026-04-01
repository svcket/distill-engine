import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { adaptInsightResponse } from '@/lib/adapters'
import path from 'path'
import fs from 'fs'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { transcriptId, type, audience, tone } = await request.json()

        if (!transcriptId) {
            return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
        }

        const executionDir = path.resolve(process.cwd(), '../execution')

        function resolveFilePath(baseDir: string, dir: string, sourceId: string, suffix: string): string {
            const strictPath = path.join(baseDir, dir, `${sourceId}${suffix}`);
            if (fs.existsSync(strictPath)) return strictPath;
        
            const strippedId = sourceId.replace(/^spotify_/, '');
            const strippedPath = path.join(baseDir, dir, `${strippedId}${suffix}`);
            if (fs.existsSync(strippedPath)) return strippedPath;
        
            if (!sourceId.startsWith('spotify_')) {
                const prefixedPath = path.join(baseDir, dir, `spotify_${sourceId}${suffix}`);
                if (fs.existsSync(prefixedPath)) return prefixedPath;
            }
    
            const altDir = path.join(baseDir, dir, sourceId);
            const altStrictPath = path.join(altDir, `${sourceId}${suffix}`);
            if (fs.existsSync(altStrictPath)) return altStrictPath;
    
            const altStrippedPath = path.join(baseDir, dir, strippedId, `${strippedId}${suffix}`);
            if (fs.existsSync(altStrippedPath)) return altStrippedPath;
    
            const altPrefixedPath = !sourceId.startsWith('spotify_') ? path.join(baseDir, dir, `spotify_${sourceId}`, `spotify_${sourceId}${suffix}`) : '';
            if (altPrefixedPath && fs.existsSync(altPrefixedPath)) return altPrefixedPath;
            
            return strictPath; // Default fallback if none found
        }
    
        const insightsPath = resolveFilePath(executionDir, '.tmp/insights', transcriptId, '_insights.json')

        const args = ["--input", insightsPath]
        if (type) args.push("--type", type)
        if (audience) args.push("--audience", audience)
        if (tone) args.push("--tone", tone)

        const { success, error, rawOutput } = await runPythonScript("angle_strategist.py", args, {
            expectedArtifact: `.tmp/angles/${transcriptId}_angle.json`
        })

        if (!success) {
            return NextResponse.json({ error: "Failed to generate angles with LLM", details: error }, { status: 500 })
        }

        // We can reuse the JSON parsing structure from adaptInsightResponse since it's standardized
        const result = adaptInsightResponse(rawOutput || "")

        // Persist stage completion
        await prisma.source.update({
            where: { id: transcriptId, userId: session.user.id },
            data: {
                completedStages: {
                    push: 'angle'
                }
            }
        })

        return NextResponse.json({ result, message: `Strategized angles for: ${transcriptId}` })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "An unknown error occurred"
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
