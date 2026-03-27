import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function POST(req: Request) {
    try {
        const { id } = await req.json()
        if (!id) return NextResponse.json({ error: "No ID provided" }, { status: 400 })

        const draftsDir = path.resolve(process.cwd(), '../execution/.tmp/drafts')
        const fileName = `${id}_draft.json`
        const filePath = path.join(draftsDir, fileName)

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            return NextResponse.json({ success: true })
        } else {
            return NextResponse.json({ error: "Draft not found" }, { status: 404 })
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
