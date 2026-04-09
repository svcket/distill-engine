import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
    try {
        const session = await auth()
        if (!session?.user?.id || !session.user.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const email = session.user.email;
        const userId = session.user.id;

        // 1. Check Whitelist (Enforce in Production)
        const whitelisted = await prisma.betaWhitelist.findUnique({
            where: { email }
        })

        // Bypass whitelist for specific dev email or if not in production
        const isDevBypass = process.env.NODE_ENV === 'development' || email === 'nsikan.design@gmail.com';

        if (!whitelisted && !isDevBypass) {
            return NextResponse.json({ 
                error: "Access Denied", 
                message: "Your email is not on the beta whitelist. Please request access at distill.so" 
            }, { status: 403 })
        }

        // 2. Grant Beta Access in Database
        await prisma.user.update({
            where: { id: userId },
            data: { isBeta: true }
        })

        // 3. Initialize or Update Usage to Pro
        await prisma.usage.upsert({
            where: { userId: userId },
            update: { currentPlan: "beta_pro" },
            create: { 
                userId: userId,
                currentPlan: "beta_pro",
                sourcesProcessed: 0,
                draftsGenerated: 0
            }
        })

        // console.log(`Beta Enrollment Success: User ${email} (ID: ${userId}) promoted to beta_pro.`)

        return NextResponse.json({ 
            success: true, 
            message: "Beta access granted. Welcome to Distill Pro." 
        })
    } catch (err) {
        console.error("Beta enrollment error:", err)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
