"use client"

import React from 'react'
import { Source } from '@/types/workspace'
import { Card } from '@/components/ui/Card'
import { SourceCard } from './SourceCard'

interface SourceGridProps {
  sources: Source[]
  isLoading?: boolean
}

export function SourceGrid({ sources, isLoading }: SourceGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-[4/5] rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
      {sources.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
    </div>
  )
}
