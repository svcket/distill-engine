import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  console.log(JSON.stringify(sources, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
