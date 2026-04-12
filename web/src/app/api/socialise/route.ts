import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'
import { sendPushNotification } from '@/lib/one-signal'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const transcriptId = body.transcriptId || body.transcript_id || body.sourceId || body.source_id || body.id
    const { language } = body
    const sourceId = transcriptId

    if (!sourceId) {
        return NextResponse.json({ error: "Missing 'transcriptId' parameter." }, { status: 400 })
    }

    // 1. Verify source ownership (Cloud Truth)
    const source = await withRetry(() => prisma.source.findUnique({
        where: { id: sourceId, userId: session.user?.id as string }
    }))

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied" }, { status: 404 })
    }

    try {
        const args = [
            '--source-id', sourceId,
            '--url', source.url || ""
        ]
        if (language) args.push('--lang', language)

                status: "failed"
            }, { status: 500 })
        }

        // Updating source status in Supabase
        await withRetry(() => prisma.source.update({
            where: { id: sourceId, userId: session.user?.id },
            data: { 
                status: 'done',
                completedStages: {
                    push: 'socialise'
                }
            }
        }));

        // Dispatch Push Notification
        if (session.user?.id) {
            await sendPushNotification(
                session.user.id, 
                "Distillation Complete", 
                `Your analysis for "${source.title}" is ready.`,
                `${process.env.NEXT_PUBLIC_APP_URL}/directory?id=${sourceId}`
            );
        }

        return NextResponse.json({ 
            result: data,
            message: "Socialised assets generated successfully."
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
