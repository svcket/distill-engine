import { NextResponse } from "next/server"

export async function GET() {
    return NextResponse.json({ 
        status: "healthy",
        mode: "split",
        backend: process.env.BACKEND_URL ? "connected" : "local",
        timestamp: new Date().toISOString()
    })
}
