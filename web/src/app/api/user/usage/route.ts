import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        let usage = await prisma.usage.findUnique({
            where: { userId: session.user.id }
        })

        // Initialize if doesn't exist
        if (!usage) {
            usage = await prisma.usage.create({
                data: { 
                    userId: session.user.id,
                    sourcesProcessed: 0,
                    draftsGenerated: 0,
                    currentPlan: "free"
                }
            })
        }

        return NextResponse.json(usage)
    } catch (error) {
        console.error("Failed to fetch usage:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
