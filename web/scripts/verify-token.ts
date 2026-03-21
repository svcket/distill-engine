import { prisma } from "../src/lib/prisma"

/**
 * Verification Script for Magic Link Tokens
 */
async function verifyToken() {
    console.log("🚀 Checking for Verification Tokens...")

    const tokens = await prisma.verificationToken.findMany({
        where: { identifier: "tester@example.com" }
    })

    if (tokens.length > 0) {
        console.log(`✅ Found ${tokens.length} token(s) for tester@example.com.`)
        console.log("Token Details:", JSON.stringify(tokens[0], null, 2))
    } else {
        console.log("❌ No tokens found for tester@example.com.")
    }

    console.log("🏁 Verification Completed.")
}

verifyToken().catch(console.error)
