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
    UserCircle 
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
    const [isMobile, setIsMobile] = useState(false)
    const [mounted, setMounted] = useState(false)
    const langRef = useRef<HTMLDivElement>(null)

    // Mounted tracking to prevent hydration flashes
    useEffect(() => {
        setMounted(true)
    }, [])

    // Robust mobile detection and window resize tracking
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

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
        if (segs.length === 0) return t("sources") || "Directory"
        
        const key = segs[0].toLowerCase()
        if (key === 'sources' && segs.length > 1) {
            return (
                <div className="flex items-center gap-2">
                    <span className="opacity-50">{t("sources") || "Directory"}</span>
                    <ChevronDown className="w-3 h-3 -rotate-90 opacity-30" />
                    <span>Source Detail</span>
                </div>
            )
        }
        
        if (key === 'exports' && segs.length > 1) {
            return (
                <div className="flex items-center gap-2">
                    <span className="opacity-50">{t("exports") || "Studio"}</span>
                    <ChevronDown className="w-3 h-3 -rotate-90 opacity-30" />
                    <span>Draft Detail</span>
                </div>
            )
        }

        const label = t(key) || segs[0].charAt(0).toUpperCase() + segs[0].slice(1)
        return label
    })()

    // Conditionally hide shell elements on login page
    const isLoginPage = pathname === "/login"

    return (
        <div className={cn(
            "flex flex-col lg:flex-row w-full bg-background overflow-hidden font-sans",
            isLoginPage ? "h-screen" : "h-[100dvh] lg:static lg:h-screen overscroll-none"
        )}>
            {/* Sidebar */}
            {!isLoginPage && mounted && !isMobile && (
                <aside className="desktop-sidebar lg:flex flex-col h-full border-r border-border bg-accent/30 sticky top-0 w-60 flex-shrink-0 z-[100]">
                    <div className="h-14 flex items-center px-6 border-b border-border flex-shrink-0">
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

                    <div className="flex-1 overflow-y-auto py-6 px-3 no-scrollbar">
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

                    <div className="hidden lg:flex flex-col p-4 border-t border-border bg-card/50 space-y-3 mt-auto w-full">
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
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
                {!isLoginPage && (
                    <header className="h-14 flex items-center justify-between px-4 lg:px-8 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 flex-shrink-0">
                        <div className="flex items-center gap-2 text-[10px] lg:text-sm text-muted-foreground truncate uppercase tracking-widest font-bold lg:normal-case lg:font-normal lg:tracking-normal">
                            <span className="hidden lg:inline">Distill Engine <span className="text-border">/</span></span> <span className="text-foreground font-serif font-medium">{breadcrumb}</span>
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
                                    <div className="w-1.5 h-1.5 rounded-full bg-brand/40" />
                                    <span className="tracking-wide uppercase text-[10px] font-bold">{lang}</span>
                                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-300", isLangOpen && "rotate-180 text-brand")} />
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

                <div 
                    className={cn(
                        "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-smooth",
                        !isLoginPage && "bg-page-bg"
                    )}
                >
                    {children}
                </div>

                {/* Mobile Bottom Navigation (Airbnb Style) */}
                {!isLoginPage && (
                    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-t border-border flex items-center justify-around px-6 z-50">
                        <Link 
                            href="/sources" 
                            className={cn(
                                "flex flex-col items-center gap-1 transition-all",
                                pathname.startsWith("/sources") ? "text-brand" : "text-muted-foreground"
                            )}
                        >
                            <LayoutGrid className={cn("w-5 h-5", pathname.startsWith("/sources") && "scale-110")} />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">Directory</span>
                        </Link>
                        
                        <Link 
                            href="/exports" 
                            className={cn(
                                "flex flex-col items-center gap-1 transition-all",
                                pathname.startsWith("/exports") ? "text-brand" : "text-muted-foreground"
                            )}
                        >
                            <SquarePen className={cn("w-5 h-5", pathname.startsWith("/exports") && "scale-110")} />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">Studio</span>
                        </Link>
                        
                        <Link 
                            href="/settings" 
                            className={cn(
                                "flex flex-col items-center gap-1 transition-all",
                                pathname.startsWith("/settings") ? "text-brand" : "text-muted-foreground"
                            )}
                        >
                            <UserCircle className={cn("w-5 h-5", pathname.startsWith("/settings") && "scale-110")} />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">Settings</span>
                        </Link>
                    </nav>
                )}
            </main>
        </div>
    )
}
