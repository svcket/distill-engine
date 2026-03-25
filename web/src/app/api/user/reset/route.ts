import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

/**
 * POST /api/user/reset
 * Permanently clears all user-generated data: Sources, Drafts, and Usage stats.
 * Does NOT delete the user account or preferences.
 */
export async function POST() {
    const session = await auth()
    
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const userId = session.user.id

        // 1. Delete all Sources
        await prisma.source.deleteMany({
            where: { userId }
        })

        // 2. Delete all Drafts
        await prisma.draft.deleteMany({
            where: { userId }
        })

        // 3. Reset Usage Stats
        await prisma.usage.update({
            where: { userId },
            data: {
                sourcesProcessed: 0,
                draftsGenerated: 0
            }
        })

        return NextResponse.json({ 
            message: "System reset successful. All harvested data has been removed." 
        })

    } catch (error) {
        console.error("System reset error:", error)
        return NextResponse.json({ 
            error: "Failed to perform system reset" 
        }, { status: 500 })
    }
}
