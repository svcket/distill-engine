"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface HUDPodProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  accentColor?: "blue" | "purple" | "emerald" | "amber"
}

export function HUDPod({ 
  title, 
  subtitle, 
  icon, 
  children, 
  className,
  accentColor = "blue"
}: HUDPodProps) {
  const accentClasses = {
    blue: "border-blue-500/10 hover:border-blue-500/30",
    purple: "border-purple-500/10 hover:border-purple-500/30",
    emerald: "border-emerald-500/10 hover:border-emerald-500/30",
    amber: "border-amber-500/10 hover:border-amber-500/30"
  }

  const glowClasses = {
    blue: "bg-blue-500/5",
    purple: "bg-purple-500/5",
    emerald: "bg-emerald-500/5",
    amber: "bg-amber-500/5"
  }

  return (
    <div className={cn(
      "relative group rounded-2xl border bg-zinc-950/40 backdrop-blur-xl transition-all duration-500 overflow-hidden",
      accentClasses[accentColor],
      className
    )}>
      {/* Internal Glow Effect */}
      <div className={cn(
        "absolute -inset-24 opacity-0 group-hover:opacity-100 blur-[100px] transition-opacity duration-1000 pointer-events-none",
        glowClasses[accentColor]
      )} />

      <div className="relative z-10 p-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={cn(
                "p-2 rounded-lg bg-zinc-900 border border-zinc-800",
                accentColor === "blue" && "text-blue-400",
                accentColor === "purple" && "text-purple-400",
                accentColor === "emerald" && "text-emerald-400",
                accentColor === "amber" && "text-amber-400"
              )}>
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-zinc-100 font-mono">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1">
          {children}
        </div>
      </div>
      
      {/* Decorative Corner Elements */}
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-zinc-800 rounded-tr-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-zinc-800 rounded-bl-2xl pointer-events-none" />
    </div>
  )
}
