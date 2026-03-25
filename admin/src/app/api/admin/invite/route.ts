import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    const session = await auth()
    
    // Security: Only Admin or Operator
    const user = session?.user as { id: string; email: string; role?: string } | undefined
    if (user?.role !== "ADMIN" && user?.email !== "operator@distill.agency") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    try {
        const { email } = await req.json()
        if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

        const invited = await (prisma as any).betaWhitelist.create({
            data: { 
                email: email.toLowerCase().trim(),
                invitedBy: user?.email || "System"
            }
        })

        return NextResponse.json({ success: true, invited })
    } catch (error: unknown) {
        const prismaError = error as { code?: string }
        if (prismaError.code === 'P2002') {
            return NextResponse.json({ error: "User already invited" }, { status: 400 })
        }
        return NextResponse.json({ error: "Failed to invite" }, { status: 500 })
    }
}
