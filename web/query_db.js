const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.source.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log(sources.map(s => ({ id: s.id, type: s.type, url: s.url })));
}

main().finally(() => prisma.$disconnect());
