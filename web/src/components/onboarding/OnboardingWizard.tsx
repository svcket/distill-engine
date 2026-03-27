"use client"

import React from "react"
import { motion } from "framer-motion"
import { 
    Mic, 
    Cpu, 
    Share2, 
    ArrowRight,
    Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingStepProps {
    title: string
    description: string
    icon: React.ReactNode
    index: number
    active?: boolean
    completed?: boolean
}

function OnboardingStep({ title, description, icon, index, active }: OnboardingStepProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
                "flex flex-col p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group h-full",
                active 
                    ? "border-emerald-500/30 bg-emerald-500/[0.03] ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/5" 
                    : "border-border/40 bg-card/40 hover:border-border/80"
            )}
        >
            <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-colors",
                active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-muted text-muted-foreground"
            )}>
                {icon}
            </div>
            
            <div className="space-y-2 flex-1">
                <h3 className="text-lg font-serif font-bold tracking-tight">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed leading-snug">
                    {description}
                </p>
            </div>

            {active && (
                <div className="mt-6 flex items-center text-emerald-600 text-[10px] font-black uppercase tracking-widest gap-2">
                    Active Step <ArrowRight className="w-3 h-3" />
                </div>
            )}
            
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                {React.cloneElement(icon as React.ReactElement<{ size: number }>, { size: 100 })}
            </div>
        </motion.div>
    )
}

export function OnboardingWizard() {
    return (
        <div className="max-w-5xl mx-auto py-12 space-y-12">
            <div className="text-center space-y-4">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[10px] font-black uppercase tracking-widest mb-2"
                >
                    <Sparkles className="w-3 h-3" /> Quick Start Guide
                </motion.div>
                <h2 className="text-4xl font-serif font-bold tracking-tight text-foreground">
                    Build your Content Engine.
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                    Distill turns raw audio, video, and web articles into high-fidelity editorial assets in three industrial stages.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <OnboardingStep 
                    index={0}
                    active
                    title="1. Harvest"
                    description="Record live meetings or upload voice sources. The engine expects pure density."
                    icon={<Mic className="size-5" />}
                />
                <OnboardingStep 
                    index={1}
                    title="2. Industrialize"
                    description="Our pipeline generates structured transcripts, DQM scores, and intelligent blueprints."
                    icon={<Cpu className="size-5" />}
                />
                <OnboardingStep 
                    index={2}
                    title="3. Distribute"
                    description="Export threads, newsletters, and scripts directly to your publishing channels."
                    icon={<Share2 className="size-5" />}
                />
            </div>

            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="pt-8 flex flex-col items-center gap-4 text-center"
            >
                <div className="h-px w-24 bg-border/50" />
                <p className="text-sm text-muted-foreground/60 italic font-serif">
                    Start by capturing a source above or exploring the directory.
                </p>
            </motion.div>
        </div>
    )
}
