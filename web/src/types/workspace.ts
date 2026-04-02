import { Source as PrismaSource } from '@prisma/client'

export interface Source extends PrismaSource {
  thumbnailUrl?: string
}
