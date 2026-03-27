"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
    Settings, 
    ChevronDown, 
    SquarePen, 
    LayoutGrid, 
    LogOut, 
} from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Image from "next/image"
import { useLanguage, Language } from "@/context/LanguageContext"
import { useBeta } from "@/context/BetaContext"
import { Badge } from "@/components/ui/Badge"

interface UserWithPlan {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    id?: string;
    role?: string;
    plan?: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession()
    const { isBetaActive, isBetaEnrolled } = useBeta()
    const user = session?.user as UserWithPlan | undefined
    const userPlan = isBetaEnrolled ? "pro" : (user?.plan || "free")
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
        { name: t("sources"), href: "/sources", icon: LayoutGrid },
        { name: t("exports"), href: "/exports", icon: SquarePen },
    ]

    const secondaryItems = [
        { name: t("settings"), href: "/settings", icon: Settings },
    ]

    // Derive breadcrumb from pathname
    const breadcrumb = (() => {
        const segs = pathname.split('/').filter(Boolean)
        if (segs.length === 0) return t("sources")
        const key = segs[0].toLowerCase()
        if (key === 'sources' && segs.length > 1) return 'Directory Detail'
        if (key === 'sources') return t("sources")
        return t(key) || segs[0].charAt(0).toUpperCase() + segs[0].slice(1)
    })()

    // Conditionally hide shell elements on login page
    const isLoginPage = pathname === "/login"

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
            {/* Sidebar */}
            {!isLoginPage && (
                <aside className="w-60 flex-shrink-0 border-r border-border bg-accent/30 flex flex-col">
                    <div className="h-14 flex items-center px-6 border-b border-border">
                        <Link href="/" className="flex items-center gap-2 font-serif font-bold text-lg tracking-tight">
                            <div className="w-5 h-5 bg-brand rounded-sm flex items-center justify-center">
                                <div className="w-2 h-2 bg-background rounded-full" />
                            </div>
                            Distill Engine
                            {isBetaActive && (
                                <Badge variant="outline" className="ml-1 h-4 px-1 text-[8px] font-black border-brand/30 text-brand bg-brand/5 uppercase tracking-tighter">
                                    Beta
                                </Badge>
                            )}
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
                                            "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                                            isActive
                                                ? "bg-zinc-950 text-white shadow-sleek dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-l-2 dark:border-emerald-500 shadow-none"
                                                : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon className={cn("h-4 w-4", isActive ? "text-white dark:text-emerald-500" : "text-muted-foreground/70 group-hover:text-foreground")} />
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
                                            "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                                            isActive
                                                ? "bg-zinc-950 text-white shadow-sleek dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-l-2 dark:border-emerald-500 shadow-none"
                                                : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon className={cn("h-4 w-4", isActive ? "text-white dark:text-emerald-500" : "text-muted-foreground/70 group-hover:text-foreground")} />
                                        {item.name}
                                    </Link>
                                )
                            })}
                            
                            <button
                                onClick={() => signOut({ callbackUrl: "/login" })}
                                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-red-500/5 hover:text-red-500 transition-all duration-150"
                            >
                                <LogOut className="h-4 w-4 text-muted-foreground/70" />
                                Log Out
                            </button>
                        </div>
                    </div>

                    <div className="p-4 border-t border-border bg-card/50 space-y-3">
                        <Link 
                            href="/settings"
                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                        >
                            <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center overflow-hidden border border-brand/20 relative shadow-inner group-hover:scale-105 transition-transform">
                                {user?.image ? (
                                    <Image 
                                        src={user.image} 
                                        alt={user.name || "Profile"} 
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <span className="text-xs font-bold text-brand uppercase">{(user?.name?.[0] || "?")}</span>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-foreground truncate">{user?.name?.replace(/\s*\(Founder\)\s*/gi, '') || "Member"}</span>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                                    {userPlan.toUpperCase()} PLAN
                                    {isBetaEnrolled && isBetaActive && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    )}
                                </span>
                            </div>
                        </Link>
                    </div>
                </aside>
            )}

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0">
                {!isLoginPage && (
                    <header className="h-14 flex items-center justify-between px-8 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            Distill Engine <span className="text-border">/</span> <span className="text-foreground font-serif font-medium">{breadcrumb}</span>
                        </div>
                        <div className="flex items-center gap-3">
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
                                    <div className="absolute top-full right-0 mt-2 w-32 bg-background border border-border shadow-sleek rounded-xl p-1 z-50 animate-in fade-in slide-in-from-top-2">
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
                )}

                <div className={cn("flex-1 overflow-y-auto", !isLoginPage && "bg-page-bg")}>
                    {children}
                </div>
            </main>
        </div>
    )
}
