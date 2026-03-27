import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { DigestEmail } from "@/components/emails/DigestEmail"
import { NextResponse } from "next/server"
import { subHours, subDays, startOfDay } from "date-fns"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: Request) {
    // 1. Security Check (Basic Cron Protection)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return new Response('Unauthorized', { status: 401 })
    }

    try {
        // 2. Determine Digest Window (Daily vs Weekly)
        const now = new Date()
        const isMonday = now.getDay() === 1
        const windows = [
            { type: 'daily', since: subHours(now, 24) },
            ...(isMonday ? [{ type: 'weekly', since: subDays(now, 7) }] : [])
        ]

        const results = []

        for (const window of windows) {
            // 3. Find Users for this window
            const users = await prisma.user.findMany({
                where: {
                    preferences: {
                        notifyEmailDigest: window.type
                    }
                },
                include: { preferences: true }
            })

            for (const user of users) {
                // 4. Find new insights (Completed Sources) for this user since window.since
                const insights = await prisma.source.findMany({
                    where: {
                        userId: user.id,
                        status: 'completed',
                        createdAt: { gte: window.since }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5 // Limit to top 5 major insights
                })

                if (insights.length > 0) {
                    // 5. Build Insight Data for Email
                    const digestInsights = insights.map(i => ({
                        title: i.title,
                        type: i.type,
                        url: `${process.env.NEXT_PUBLIC_APP_URL}/sources?id=${i.id}`,
                        date: new Date(i.createdAt).toLocaleDateString(),
                        summary: i.content?.substring(0, 160) + "..." // Simple summary for now
                    }))

                    // 6. Send Email
                    try {
                        await resend.emails.send({
                            from: 'Distill <onboarding@resend.dev>', // Update with verify domain later
                            to: [user.email || ""],
                            subject: `Your ${window.type === 'daily' ? 'Daily' : 'Weekly'} Distill Digest: ${insights.length} New Insights`,
                            react: DigestEmail({
                                userName: user.name || "User",
                                insights: digestInsights
                            })
                        })
                        results.push({ userId: user.id, status: 'sent', count: insights.length })
                    } catch (emailErr) {
                        console.error(`Failed to send email to ${user.id}:`, emailErr)
                        results.push({ userId: user.id, status: 'error', error: String(emailErr) })
                    }
                }
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (error) {
        console.error("Cron Digest failed:", error)
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
    }
}
