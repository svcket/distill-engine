import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        let preferences = await prisma.userPreferences.findUnique({
            where: { userId: session.user.id }
        })

        // SELF-HEALING: Recreate user if lost during migration/reset
        let user = await prisma.user.findUnique({ where: { id: session.user.id } })
        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: session.user.id,
                    name: session.user.name,
                    email: session.user.email,
                    image: session.user.image,
                }
            })
        }

        // Initialize if doesn't exist
        if (!preferences) {
            preferences = await prisma.userPreferences.create({
                data: { userId: session.user.id }
            })
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

    try {
        // SELF-HEALING: Recreate user if lost during migration/reset
        let user = await prisma.user.findUnique({ where: { id: session.user.id } })
        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: session.user.id,
                    name: session.user.name,
                    email: session.user.email,
                    image: session.user.image,
                }
            })
        }

        const body = await request.json()
        const { oneSignalUserId, ...rest } = body

        // 1. Update User level fields if provided
        if (oneSignalUserId !== undefined) {
            await prisma.user.update({
                where: { id: session.user.id },
                data: { oneSignalUserId }
            })
        }
        
        // 2. Update Preferences
        const preferences = await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: rest as any,
            create: {
                userId: session.user.id,
                ...(rest as any)
            }
        })

        return NextResponse.json(preferences)
    } catch (error) {
        console.error("Failed to update preferences:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
