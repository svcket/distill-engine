import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma, withRetry } from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id, content, title } = await request.json()

        if (!content) {
            return NextResponse.json({ error: "Missing 'content' parameter." }, { status: 400 })
        }

        const userId = session.user.id

        // TRUTH CHECK: We use the prisma.draft.upsert to either update an existing draft (by ID) 
        // or create a new one. Since the incoming 'id' might be a CUID or a temporary frontend ID,
        // we handle both cases.
        const draft = await withRetry(() => prisma.draft.upsert({
            where: { 
                id: id?.includes('draft_') ? 'new' : id || 'new' 
            },
            update: {
                content,
                title: title || "Untitled Draft",
            },
            create: {
                userId,
                content,
                title: title || "Untitled Draft",
            }
        }))

        return NextResponse.json({ 
            success: true, 
            message: "Draft saved successfully",
            id: draft.id 
        })
    } catch (error: unknown) {
        console.error('[API Drafts Save Error]', error)
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to save draft", details: msg }, { status: 500 })
    }
}
