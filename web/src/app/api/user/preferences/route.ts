import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = String(session.user.id)
    try {
        // 1. Fetch preferences scoped to scalar userId
        let preferences = await withRetry(() => prisma.userPreferences.findUnique({
            where: { userId }
        }))

        // SELF-HEALING: Recreate user record if lost during migration/reset (Ensures Referential Integrity)
        let user = await withRetry(() => prisma.user.findUnique({ where: { id: userId } }))
        if (!user) {
            user = await withRetry(() => prisma.user.create({
                data: {
                    id: userId,
                    name: session.user?.name || 'Pro User',
                    email: session.user?.email || '',
                    image: session.user?.image || '',
                }
            }))
        }

        // Initialize if doesn't exist
        if (!preferences) {
            preferences = await withRetry(() => prisma.userPreferences.create({
                data: { userId }
            }))
        }

        return NextResponse.json(preferences)
    } catch (error) {
        console.error("Failed to fetch preferences:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = String(session.user.id)
    try {
        // SELF-HEALING: Recreate user record if lost during migration/reset
        let user = await withRetry(() => prisma.user.findUnique({ where: { id: userId } }))
        if (!user) {
            user = await withRetry(() => prisma.user.create({
                data: {
                    id: userId,
                    name: session.user?.name || 'Pro User',
                    email: session.user?.email || '',
                    image: session.user?.image || '',
                }
            }))
        }

        const body = await request.json()
        const { oneSignalUserId, ...rest } = body

        // 1. Update User level fields if provided
        if (oneSignalUserId !== undefined) {
            await withRetry(() => prisma.user.update({
                where: { id: userId },
                data: { oneSignalUserId }
            }))
        }
        
        // 2. Update Preferences
        const preferences = await withRetry(() => prisma.userPreferences.upsert({
            where: { userId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            update: rest as any,
            create: {
                userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(rest as any)
            }
        }))

        return NextResponse.json(preferences)
    } catch (error) {
        console.error("Failed to update preferences:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
