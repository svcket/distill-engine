import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY as string

export async function POST(req: NextRequest) {
  const body = await req.json()
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest("hex")

  if (hash !== req.headers.get("x-paystack-signature")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const { event, data } = body

  // Handle various Paystack events
  switch (event) {
    case "subscription.create":
    case "subscription.enable":
      await handleSubscriptionChange(data, "pro")
      break
    case "subscription.disable":
    case "subscription.not_renew":
      await handleSubscriptionChange(data, "free")
      break
    case "charge.success":
      // Optional: Log successful payment or update usage credits
      break
    default:
      // console.log(`Unhandled Paystack event: ${event}`)
  }

  return NextResponse.json({ received: true })
}

interface WebhookData { customer: { email: string }; [key: string]: unknown; }
async function handleSubscriptionChange(data: WebhookData, plan: "free" | "pro") {
  const email = data.customer.email
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: { usage: true }
  })

  if (user) {
    await prisma.usage.upsert({
      where: { userId: user.id },
      update: {
        currentPlan: plan,
        // Reset or boost credits if needed
      },
      create: {
        userId: user.id,
        currentPlan: plan,
        sourcesProcessed: 0,
        draftsGenerated: 0,
      }
    })
    // console.log(`Updated plan for ${email} to ${plan}`)
  }
}
