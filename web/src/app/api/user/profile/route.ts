import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { profileSchema } from "@/lib/validation/profile-schema"
import { NextResponse } from "next/server"

/**
 * PATCH /api/user/profile
 * Securely update the authenticated user's profile information.
 * Supports: name, email, image (avatar).
 */
export async function PATCH(request: Request) {
    const session = await auth()
    
    // 1. Authentication Check
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        
        // 2. Validation
        const result = profileSchema.safeParse(body)
        if (!result.success) {
            return NextResponse.json({ 
                error: "Validation Failed", 
                details: result.error.flatten().fieldErrors 
            }, { status: 400 })
        }

        const data = result.data
        const updateData: Record<string, unknown> = {}

        // 3. Sanitization & Mapping
        if (data.name) updateData.name = data.name
        if (data.image) updateData.image = data.image
        
        // Handle Email Update with special care
        if (data.email) {
            // Check if email is already taken by another user
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email }
            })
            
            if (existingUser && existingUser.id !== session.user.id) {
                return NextResponse.json({ error: "Email already in use" }, { status: 409 })
            }
            
            updateData.email = data.email
            // If email is changed, it needs re-verification
            if (data.email !== session.user.email) {
                updateData.emailVerified = null
            }
        }

        // 4. Database Update
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ message: "No changes requested" })
        }

        const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                emailVerified: true
            }
        })

        return NextResponse.json({
            message: "Profile updated successfully",
            user: updatedUser
        })

    } catch (error: unknown) {
        console.error("Profile update error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
