import { auth } from "@/auth"
import { prisma, withRetry } from "@/lib/prisma"
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: sourceId } = await params;
    const userId = session.user.id;

    if (!sourceId) {
        return NextResponse.json({ error: 'Missing sourceId' }, { status: 400 })
    }

    // SECURITY: Ensure the user owns this source before returning disk artifacts
    const source = await withRetry(() => prisma.source.findUnique({
        where: { id: sourceId, userId }
    }))

    if (!source) {
        return NextResponse.json({ error: "Source not found or access denied." }, { status: 404 })
    }

    const backendUrl = process.env.BACKEND_URL;
    const apiKey = process.env.INTERNAL_API_KEY;

    if (!backendUrl || !apiKey) {
        console.error("[Results API] Missing configuration: BACKEND_URL or INTERNAL_API_KEY");
        return NextResponse.json({ error: "Backend configuration error" }, { status: 500 });
    }

    try {
        const response = await fetch(`${backendUrl}/results/${sourceId}`, {
            headers: {
                "x-api-key": apiKey
            },
            // Cache results for 1 minute to avoid hammering Railway
            next: { revalidate: 60 }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Results API] Railway error (${response.status}):`, errorText);
            return NextResponse.json({ error: "Failed to fetch results from engine" }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (e) {
        console.error("[Results API] Proxy Error:", e);
        return NextResponse.json({ error: "Connection to engine failed" }, { status: 502 });
    }

    return NextResponse.json({ results })
}
