import { auth } from "@/auth"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

export async function POST(request: Request) {
    return NextResponse.json({ 
        error: "Local file uploads are currently restricted in Cloud Mode. Please use a public URL or local dev environment.", 
        status: "restricted" 
    }, { status: 403 })
}
