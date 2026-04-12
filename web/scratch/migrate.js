const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Running surgical SQL migration...')
  try {
    // We use $executeRawUnsafe to add the column directly to the database
    const result = await prisma.$executeRawUnsafe('ALTER TABLE "Source" ADD COLUMN IF NOT EXISTS "externalId" TEXT;')
    console.log('Success: externalId column handled.')
  } catch (err) {
    console.error('Error during manual migration:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
