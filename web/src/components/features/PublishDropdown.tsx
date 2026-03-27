"use client"

import React, { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { 
    Send, 
    ChevronDown, 
    Twitter, 
    Linkedin, 
    Share2, 
    FileText, 
    Globe, 
    MessageSquare,
    Zap
} from "lucide-react"

export type Platform = {
    id: string
    label: string
    icon: React.ElementType
    description: string
}

const MISSION_CONTROL_PLATFORMS: Platform[] = [
    { id: 'x', label: 'X (Twitter)', icon: Twitter, description: 'Post as thread' },
    { id: 'threads', label: 'Threads', icon: MessageSquare, description: 'Post to Meta Threads' },
    { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, description: 'Share on professional network' },
]

const DRAFT_STUDIO_PLATFORMS: Platform[] = [
    ...MISSION_CONTROL_PLATFORMS,
    { id: 'substack', label: 'Substack', icon: FileText, description: 'Publish newsletter' },
    { id: 'medium', label: 'Medium', icon: Share2, description: 'Import to blog' },
    { id: 'hashnode', label: 'Hashnode', icon: Zap, description: 'Developer blog' },
    { id: 'blog', label: 'Custom Blog', icon: Globe, description: 'Webhooks / API' },
]

interface PublishDropdownProps {
    type: 'mission_control' | 'draft_studio'
    onPublish: (platformId: string) => void
    isPublishing?: boolean
    disabled?: boolean
    trigger?: React.ReactNode
}

export function PublishDropdown({ type, onPublish, isPublishing, disabled, trigger }: PublishDropdownProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const platforms = type === 'mission_control' ? MISSION_CONTROL_PLATFORMS : DRAFT_STUDIO_PLATFORMS

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative" ref={containerRef}>
            {trigger ? (
                <div onClick={() => setIsOpen(!isOpen)}>
                    {trigger}
                </div>
            ) : (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={disabled || isPublishing}
                    className={cn(
                        "flex items-center justify-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all border border-emerald-500/20 active:scale-95 shadow-sm",
                        isPublishing 
                            ? "bg-muted text-muted-foreground cursor-not-allowed" 
                            : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500/40"
                    )}
                >
                    {isPublishing ? (
                        <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Post</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
            )}

            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-card border border-border/50 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 border-b border-border/20 bg-muted/20">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">Select Destination</p>
                    </div>
                    <div className="relative group/scroll">
                        <div className="p-1.5 flex flex-col gap-1 max-h-[280px] overflow-y-auto custom-scrollbar scroll-smooth pb-8">
                            {platforms.map((platform) => {
                                const Icon = platform.icon
                                return (
                                    <button
                                        key={platform.id}
                                        onClick={() => {
                                            onPublish(platform.id)
                                            setIsOpen(false)
                                        }}
                                        className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group"
                                    >
                                        <div className="mt-0.5 p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-foreground">{platform.label}</span>
                                            <span className="text-[10px] text-muted-foreground leading-tight">{platform.description}</span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        {/* Scroll hint gradient */}
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none opacity-0 group-hover/scroll:opacity-100 transition-opacity" />
                    </div>
                </div>
            )}
        </div>
    )
}
