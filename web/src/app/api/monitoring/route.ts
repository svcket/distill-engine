import { NextResponse } from "next/server"
import { auth } from "@/auth"
import fs from "fs/promises"
import path from "path"

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Only Operator or Beta users can see health stats
        const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
        const isBeta = (session.user as { plan?: string }).plan === "beta_pro";
        
        if (!isAdmin && !isBeta) {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 })
        }

        const statsPath = path.join(process.cwd(), "../execution/.tmp/monitoring/rescue_stats.json")
        
        try {
            const data = await fs.readFile(statsPath, "utf-8")
            return NextResponse.json(JSON.parse(data))
        } catch (err) {
            // If file doesn't exist yet, return initialized empty stats
            return NextResponse.json({ 
                attempts: [], 
                stats: { success: 0, failure: 0 },
                message: "Monitoring file not found. Harvester may not have run yet."
            })
        }
    } catch (err) {
        console.error("Monitoring API error:", err)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
