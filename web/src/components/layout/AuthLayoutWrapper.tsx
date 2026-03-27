"use client"

import { usePathname } from "next/navigation"
import { AppShell } from "./AppShell"

export function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    // Standalone pages for Auth to keep them premium and focused
    const isAuthPage = pathname === "/login" || pathname === "/auth/verify-request"

    if (isAuthPage) {
        return <main className="min-h-screen bg-[#050505]">{children}</main>
    }

    return <AppShell>{children}</AppShell>
}
