import { auth } from "@/auth"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        
        if (!file) {
            return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 })
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Ensure upload directory exists and is scoped to the user for isolation
        const baseUploadDir = path.resolve(process.cwd(), '../execution/data/uploads')
        const uploadDir = path.join(baseUploadDir, session.user.id)
        await fs.mkdir(uploadDir, { recursive: true })

        // Generate unique filename to avoid collisions
        const ext = path.extname(file.name)
        const safeName = `${randomUUID()}${ext}`
        const filePath = path.join(uploadDir, safeName)

        await fs.writeFile(filePath, buffer)

        // Return the upload:// URI which points to the absolute path
        // The adapter will handle this
        return NextResponse.json({ 
            url: `upload://${filePath}`,
            originalName: file.name,
            size: file.size
        })

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        console.error("File upload error:", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
