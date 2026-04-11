import { NextResponse } from 'next/server'

/**
 * Handle audio recording uploads.
 * In Cloud Mode, direct filesystem recording is disabled.
 */
export async function POST(request: Request) {
    return NextResponse.json({ 
        error: "Direct audio recording is currently restricted in Cloud Mode. Please use a public URL or local dev environment.", 
        status: "restricted" 
    }, { status: 403 })
}
