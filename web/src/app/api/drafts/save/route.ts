import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const EXECUTION_DIR = path.resolve(process.cwd(), '../execution')
const DRAFTS_DIR = path.join(EXECUTION_DIR, '.tmp', 'drafts')

export async function POST(request: Request) {
    try {
        const { id, content } = await request.json()

        if (!id || !content) {
            return NextResponse.json({ error: "Missing 'id' or 'content' parameter." }, { status: 400 })
        }

        // Ensure directory exists
        if (!fs.existsSync(DRAFTS_DIR)) {
            fs.mkdirSync(DRAFTS_DIR, { recursive: true })
        }

        const draftPath = path.join(DRAFTS_DIR, `${id}_draft.json`)
        
        // In a real scenario, we might want to preserve the metadata
        // For now, we update the data.content field in the JSON file
        let existingData: any = {}
        if (fs.existsSync(draftPath)) {
            existingData = JSON.parse(fs.readFileSync(draftPath, 'utf8'))
        }

        const updatedData = {
            ...existingData,
            data: {
                ...(existingData.data || {}),
                content,
            },
            updatedAt: new Date().toISOString()
        }

        fs.writeFileSync(draftPath, JSON.stringify(updatedData, null, 2))

        return NextResponse.json({ success: true, message: "Draft saved successfully" })
    } catch (error: any) {
        console.error('[API Drafts Save Error]', error)
        return NextResponse.json({ error: "Failed to save draft", details: error.message }, { status: 500 })
    }
}
