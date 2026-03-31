"use client"

import { usePathname } from "next/navigation"
import { AppShell } from "./AppShell"
import { useLanguage } from "@/context/LanguageContext"

export function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    // Standalone pages for Auth to keep them premium and focused
    const isAuthPage = pathname === "/login" || pathname === "/auth/verify-request"

    if (isAuthPage) {
        return <main className="min-h-screen bg-[#050505]">{children}</main>
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 1023px) {
                    .desktop-sidebar { display: none !important; }
                }
            `}} />
            <AppShell>{children}</AppShell>
        </>
    )
}
