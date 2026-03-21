import { auth } from "@/auth"
import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function GET(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId')

    if (!sourceId) {
        return NextResponse.json({ error: "Missing 'sourceId' parameter." }, { status: 400 })
    }

    try {
        const { success, data, error } = await runPythonScript<any>('verify_pipeline.py', ['--source-id', sourceId])

        if (!success) {
            return NextResponse.json({ error: "Verification failed", details: error }, { status: 500 })
        }

        return NextResponse.json({ result: data })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
