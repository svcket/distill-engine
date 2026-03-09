"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    Search,
    Download,
    Library,
    Settings
} from "lucide-react"

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    const navItems = [
        { name: "Overview", href: "/", icon: LayoutDashboard },
        { name: "Sources", href: "/sources", icon: Search },
        { name: "Export Center", href: "/exports", icon: Download },
        { name: "Knowledge Library", href: "/library", icon: Library },
    ]

    const secondaryItems = [
        { name: "Settings", href: "/settings", icon: Settings },
    ]

    // Derive breadcrumb from pathname
    const breadcrumb = (() => {
        const segs = pathname.split('/').filter(Boolean)
        if (segs.length === 0) return 'Overview'
        if (segs[0] === 'sources' && segs.length > 1) return 'Source Detail'
        return segs[0].charAt(0).toUpperCase() + segs[0].slice(1)
    })()

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden">
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
                        Distill Engine <span className="text-border">/</span> <span className="text-foreground font-medium">{breadcrumb}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Engine Online
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
