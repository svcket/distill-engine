"use client"

import React from 'react'
import { Source } from '@/types/workspace'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Clock, BarChart2, Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface SourceCardProps {
  source: Source
}

export function SourceCard({ source }: SourceCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-400/10'
    if (score >= 60) return 'text-amber-400 bg-amber-400/10'
    return 'text-rose-400 bg-rose-400/10'
  }

  return (
    <Link href={`/workspace/sources/${source.id}`}>
      <Card className="group relative overflow-hidden bg-black/20 backdrop-blur-[2px] border-white/5 hover:border-white/10 transition-all duration-300">
        <div className="aspect-[4/5] relative overflow-hidden">
          {source.thumbnailUrl ? (
            <Image
              src={source.thumbnailUrl}
              alt={source.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <BarChart2 className="w-12 h-12 text-white/10" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-current" />
            </div>
          </div>

          <div className="absolute bottom-2 left-2 flex gap-1.5">
            <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-none text-[12px] h-6 px-2 font-mono">
              <Clock className="w-3 h-3 mr-1 opacity-60" />
              {source.duration || '0:00'}
            </Badge>
            {source.score && (
              <Badge variant="secondary" className={cn("backdrop-blur-md border-none text-[12px] h-6 px-2 font-bold", getScoreColor(source.score))}>
                {source.score}%
              </Badge>
            )}
          </div>
        </div>

        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="h-8 px-3 text-[12px] uppercase tracking-wider border-white/10 bg-white/5 text-white/60">
              {source.type}
            </Badge>
            <span className="text-[10px] text-white/30 font-medium">
              {formatDistanceToNow(new Date(source.createdAt), { addSuffix: true })}
            </span>
          </div>
          
          <h3 className="text-base font-medium text-white/90 leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-white transition-colors">
            {source.title}
          </h3>
        </div>
      </Card>
    </Link>
  )
}
