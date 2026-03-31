import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function check() {
    const sources = await prisma.source.findMany({
        where: {
            id: { startsWith: "spotify_" }
        }
    })
    console.log(JSON.stringify(sources, null, 2))
    process.exit(0)
}

check().catch(e => {
    console.error(e)
    process.exit(1)
})
