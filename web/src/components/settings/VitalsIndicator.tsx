"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface VitalsIndicatorProps {
  label: string
  status: "online" | "warning" | "offline"
  subValue?: string
}

export function VitalsIndicator({ label, status, subValue }: VitalsIndicatorProps) {
  const statusColors = {
    online: "bg-emerald-500",
    warning: "bg-amber-500",
    offline: "bg-red-500"
  }

  const glowColors = {
    online: "bg-emerald-500/20",
    warning: "bg-amber-500/20",
    offline: "bg-red-500/20"
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 group/vital">
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {label}
        </span>
        {subValue && (
          <span className="text-xs font-mono text-zinc-300 mt-0.5">
            {subValue}
          </span>
        )}
      </div>
      
      <div className="relative">
        <div className={cn(
          "w-2 h-2 rounded-full z-10 relative",
          statusColors[status],
          status === "online" && "animate-pulse"
        )} />
        <div className={cn(
          "absolute -inset-1 rounded-full blur-sm",
          glowColors[status]
        )} />
      </div>
    </div>
  )
}
