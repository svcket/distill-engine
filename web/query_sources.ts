import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const source = await prisma.source.findUnique({
    where: { id: "podcast_1f64fe774cf0" }
  })
  console.log(JSON.stringify(source, null, 2))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
