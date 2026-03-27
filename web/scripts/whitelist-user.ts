import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const email = "nsikan.design@gmail.com"
  
  const whitelisted = await prisma.betaWhitelist.upsert({
    where: { email },
    update: {},
    create: {
      email,
      invitedBy: "antigravity-system"
    }
  })

  console.log("✅ Whitelisted in Database:", whitelisted)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
