import { NextResponse } from 'next/server'
import { runPythonScript } from '@/lib/python-runner'

export async function POST(request: Request) {
    try {
        const { draftId } = await request.json()

        if (!draftId) {
            return NextResponse.json({ error: "Missing 'draftId' parameter." }, { status: 400 })
        }

        const { success, error, rawOutput } = await runPythonScript("export_content_assets.py", ["--asset", `/tmp/${draftId}.md`, "--format", "json", "--destination", "all"])

        if (!success) {
            return NextResponse.json({ error: "Failed to execute content router", details: error }, { status: 500 })
        }

        return NextResponse.json({ status: "done", message: `Exported draft: ${draftId}` })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
