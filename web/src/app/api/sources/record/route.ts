import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'


/**
 * Handle audio recording uploads.
 * Saves the blob to a temp directory and returns the internal URI.
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const audioFile = formData.get('audio') as Blob
        
        if (!audioFile) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
        }

        const buffer = Buffer.from(await audioFile.arrayBuffer())
        
        const executionDir = path.resolve(process.cwd(), '../execution')
        const recordingsDir = path.join(executionDir, '.tmp', 'recordings')
        
        // Ensure directory exists
        await mkdir(recordingsDir, { recursive: true })
        
        const fileName = `rec_${crypto.randomUUID()}.webm`
        const filePath = path.join(recordingsDir, fileName)
        
        await writeFile(filePath, buffer)
        
        // Return a recording:// URI that the adapter router can recognize
        return NextResponse.json({ 
            success: true, 
            url: `recording://${filePath}`,
            source_type: 'recording'
        })

    } catch (err: unknown) {
        console.error("Recording upload failed:", err)
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
