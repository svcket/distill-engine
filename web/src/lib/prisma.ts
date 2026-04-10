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
export async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  try {
    return await fn()
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    const isConnError = 
      error.message?.includes("connection") || 
      error.message?.includes("closed") ||
      error.message?.includes("Can't reach database server") || // Specific Supabase error
      error.message?.includes("6543") || // Pooling port
      error.code === 'P1001' || // Can't reach database server
      error.code === 'P1002' || // Database server timeout
      error.code === 'P2024';   // Connection pool timeout
      
    if (retries > 0 && isConnError) {
      console.warn(`Prisma connection issue (code: ${error.code}), retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5); // Exponentially back off
    }
    throw err
  }
}
