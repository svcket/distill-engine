"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Search,
    Download,
    Library,
    Settings,
    ChevronDown
} from "lucide-react"
import { useLanguage, Language } from "@/context/LanguageContext"

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { lang, setLang, t } = useLanguage()
    const [isLangOpen, setIsLangOpen] = useState(false)
    const langRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (langRef.current && !langRef.current.contains(e.target as Node)) {
                setIsLangOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    const navItems = [
        { name: t("overview"), href: "/", icon: LayoutDashboard },
        { name: t("sources"), href: "/sources", icon: Search },
        { name: t("exports"), href: "/exports", icon: Download },
        { name: t("library"), href: "/library", icon: Library },
    ]

    const secondaryItems = [
        { name: t("settings"), href: "/settings", icon: Settings },
    ]

    // Derive breadcrumb from pathname
    const breadcrumb = (() => {
        const segs = pathname.split('/').filter(Boolean)
        if (segs.length === 0) return t("overview")
        if (segs[0] === 'sources' && segs.length > 1) return 'Source Detail'
        const key = segs[0].toLowerCase()
        return t(key) || segs[0].charAt(0).toUpperCase() + segs[0].slice(1)
    })()

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-60 flex-shrink-0 border-r border-border bg-accent/30 flex flex-col">
                <div className="h-14 flex items-center px-6 border-b border-border">
                    <Link href="/" className="flex items-center gap-2 font-serif font-bold text-lg tracking-tight">
                        <div className="w-5 h-5 bg-brand rounded-sm flex items-center justify-center">
                            <div className="w-2 h-2 bg-background rounded-full" />
                        </div>
                        Distill
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-3">
                    <div className="space-y-1">
                        <h4 className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">Product</h4>
                        {navItems.map((item) => {
                            const isActive = item.href === "/"
                                ? pathname === "/"
                                : pathname === item.href || pathname.startsWith(`${item.href}/`)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                                        isActive
                                            ? "bg-background text-brand shadow-micro"
                                            : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                                    )}
                                >
                                    <item.icon className={cn("h-4 w-4", isActive ? "text-brand" : "text-muted-foreground/70")} />
                                    {item.name}
                                </Link>
                            )
                        })}
                    </div>

                    <div className="mt-8 space-y-1">
                        <h4 className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">System</h4>
                        {secondaryItems.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                                        isActive
                                            ? "bg-background text-brand shadow-micro"
                                            : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                                    )}
                                >
                                    <item.icon className={cn("h-4 w-4", isActive ? "text-brand" : "text-muted-foreground/70")} />
                                    {item.name}
                                </Link>
                            )
                        })}
                    </div>
                </div>

                <div className="p-4 border-t border-border">
                    <div className="flex items-center gap-3 px-2 py-2">
                        <div className="h-8 w-8 rounded-full bg-border flex items-center justify-center text-xs font-medium">
                            OP
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium leading-none">Operator</span>
                            <span className="text-xs text-muted-foreground mt-1">System Active</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0">
                <header className="h-14 flex items-center justify-between px-8 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Distill Engine <span className="text-border">/</span> <span className="text-foreground font-serif font-medium">{breadcrumb}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative" ref={langRef}>
                            <button 
                                onClick={() => setIsLangOpen(!isLangOpen)}
                                className={cn(
                                    "flex items-center gap-2 text-xs font-serif font-medium px-3 py-1.5 rounded-full border transition-all",
                                    "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                    isLangOpen && "ring-2 ring-brand/10 border-brand/50"
                                )}
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                                <span>{lang}</span>
                                <ChevronDown className={cn("w-3 h-3 transition-transform", isLangOpen && "rotate-180")} />
                            </button>
                            
                            {isLangOpen && (
                                <div className="absolute top-full right-0 mt-2 w-32 bg-white border border-border shadow-soft rounded-xl p-1 z-50 animate-in fade-in slide-in-from-top-2">
                                    {[
                                        { code: 'EN', label: 'English' },
                                        { code: 'ES', label: 'Español' },
                                        { code: 'FR', label: 'Français' },
                                        { code: 'DE', label: 'Deutsch' },
                                        { code: 'YO', label: 'Yorùbá' }
                                    ].map((l) => (
                                        <button
                                            key={l.code}
                                            onClick={() => {
                                                setLang(l.code as Language)
                                                setIsLangOpen(false)
                                            }}
                                            className={cn(
                                                "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between",
                                                lang === l.code ? "bg-muted/50 text-brand font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {l.label}
                                            {lang === l.code && <div className="w-1.5 h-1.5 rounded-full bg-brand" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto bg-[#FDFDFD]">
                    {children}
                </div>
            </main>
        </div>
    )
}
