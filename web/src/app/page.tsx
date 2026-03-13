"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/context/LanguageContext"
import { WorkspaceComposer } from "@/components/workspace/WorkspaceComposer"

export default function Home() {
    const { t } = useLanguage()
    const [isIngesting, setIsIngesting] = useState(false)
    const router = useRouter()

    const handleIngest = async (value: string) => {
        if (!value || !value.trim() || isIngesting) return
        setIsIngesting(true)
        try {
            const res = await fetch("/api/sources/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: value })
            })
            const data = await res.json()
            if (res.ok && data.result?.source_id) {
                router.push(`/sources/${data.result.source_id}`)
            }
        } catch (error) {
            console.error("Ingest failed:", error)
        } finally {
            setIsIngesting(false)
        }
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-56px)] bg-[#FDFDFD] selection:bg-brand/10">
            <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-4xl mx-auto w-full -mt-20">
                {/* ── Headline ── */}
                <div className="text-center space-y-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <h1 className="text-[32px] md:text-[36px] font-serif font-semibold tracking-tight text-foreground leading-[1.2]">
                        {t('landingHeadline').split(' ').slice(0, 4).join(' ')} <br className="hidden md:block" />
                        <span className="text-brand">{t('landingHeadline').split(' ').slice(4).join(' ')}</span>
                    </h1>
                </div>

                {/* ── AI Composer ── */}
                <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150">
                    <WorkspaceComposer 
                        onIngest={handleIngest}
                        isIngesting={isIngesting}
                    />
                </div>
            </div>
        </div>
    )
}
