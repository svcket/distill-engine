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
        
        const preferences = await prisma.userPreferences.upsert({
            where: { userId: session.user.id },
            update: body,
            create: {
                userId: session.user.id,
                ...body
            }
        })

        return NextResponse.json(preferences)
    } catch (error) {
        console.error("Failed to update preferences:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
