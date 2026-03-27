import { NextResponse } from "next/server"
import { auth } from "@/auth"

export async function POST() {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // In a real app, you would update the user in Supabase/PostgreSQL
        // For the Beta bypass, we'll assume the update is local to the session
        // or handled by a mock balance.
        
        console.log(`Beta Enrollment: Enrolling user ${session.user.email} in Pro tier.`)

        return NextResponse.json({ 
            success: true, 
            message: "Beta access granted. Welcome to Distill Pro." 
        })
    } catch (err) {
        console.error("Beta enrollment error:", err)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
