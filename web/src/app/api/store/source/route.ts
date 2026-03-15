import { NextResponse } from 'next/server'
import { getSource } from '@/lib/local-store'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: "Missing 'id' parameter." }, { status: 400 })
        }

        const source = getSource(id)
        if (!source) {
            return NextResponse.json({ error: "Source not found" }, { status: 404 })
        }

        return NextResponse.json({ source })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
