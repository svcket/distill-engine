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

        // TRUTH CHECK: If no ID or a temporary frontend ID (draft_) is provided, we create a new draft.
        // Otherwise, we update the existing draft.
        const draft = await withRetry(() => {
            if (!id || id.includes('draft_')) {
                return prisma.draft.create({
                    data: {
                        userId,
                        content,
                        title: title || "Untitled Draft",
                    }
                })
            } else {
                return prisma.draft.update({
                    where: { id },
                    data: {
                        content,
                        title: title || "Untitled Draft",
                    }
                })
            }
        })

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
