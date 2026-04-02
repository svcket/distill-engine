import { PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/**
 * Shared retry logic for Prisma operations to handle transient connection drops
 * especially during high concurrency or cold starts.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const isConnError = 
      err.message?.includes("connection") || 
      err.message?.includes("closed") ||
      err.code === 'P1001' || // Can't reach database server
      err.code === 'P1002' || // Database server timeout
      err.code === 'P2024';   // Connection pool timeout
      
    if (retries > 0 && isConnError) {
      console.warn(`Prisma connection issue, retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err
  }
}
