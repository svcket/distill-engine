"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
    const router = useRouter()
    
    useEffect(() => {
        router.replace("/sources")
    }, [router])

    return (
        <div className="flex items-center justify-center min-h-screen bg-white">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-black/10 border-t-black rounded-full animate-spin" />
                <p className="text-sm font-serif text-neutral-500">Entering Distill...</p>
            </div>
        </div>
    )
}
