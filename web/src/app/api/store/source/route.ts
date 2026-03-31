import { NextResponse } from 'next/server'
import { getSource } from '@/lib/local-store'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: "Missing 'id' parameter." }, { status: 400 })
        }

        // Verify ownership in Prisma
        const prismaSource = await prisma.source.findUnique({
            where: { id },
            select: { userId: true }
        })

        if (!prismaSource) {
            return NextResponse.json({ error: "Source not found" }, { status: 404 })
        }

        const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
        if (prismaSource.userId !== session.user.id && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
