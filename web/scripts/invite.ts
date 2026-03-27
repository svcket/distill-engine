import { prisma } from "../src/lib/prisma"

async function invite(email: string) {
    if (!email) {
        console.error("❌ Please provide an email address.")
        process.exit(1)
    }

    try {
        const entry = await prisma.betaWhitelist.upsert({
            where: { email },
            update: {},
            create: { email }
        })
        console.log(`✅ Success! ${email} is now on the beta whitelist.`)
        console.log(`ID: ${entry.id}`)
    } catch (error) {
        console.error("❌ Failed to invite user:", error)
    } finally {
        await prisma.$disconnect()
    }
}

const email = process.argv[2]
invite(email)
