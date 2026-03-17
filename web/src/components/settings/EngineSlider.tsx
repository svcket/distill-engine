"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface EngineSliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

export function EngineSlider({ 
  label, 
  value, 
  min = 0, 
  max = 100, 
  step = 1, 
  unit = "%",
  onChange 
}: EngineSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {label}
        </label>
        <span className="text-xs font-mono text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/20">
          {value}{unit}
        </span>
      </div>
      
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-1 bg-muted rounded-full" />
        <div 
          className="absolute h-1 bg-brand rounded-full" 
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          title={label}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
        />
        
        {/* Physical slider thumb simulation */}
        <div 
          className="absolute w-4 h-4 rounded-full bg-background border-2 border-brand shadow-glow pointer-events-none transform -translate-x-1/2"
          style={{ left: `${((value - min) / (max - min)) * 100}%` }}
        />
      </div>
    </div>
  )
}
