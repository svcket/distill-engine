"use client"

import React, { createContext, useContext, useState } from "react"
import { useSession } from "next-auth/react"

interface BetaContextType {
    isBetaActive: boolean
    isBetaEnrolled: boolean
    enrollInBeta: () => Promise<boolean>
    loading: boolean
}

const BetaContext = createContext<BetaContextType>({
    isBetaActive: false,
    isBetaEnrolled: false,
    enrollInBeta: async () => false,
    loading: true
})

const AUTO_PRO_EMAILS = [
    "nsikan.design@gmail.com", // Lead Designer / Beta Manager
    "socket@example.com", 
    "test@distill.engine"
]

export function BetaProvider({ children }: { children: React.ReactNode }) {
    const { data: session, update } = useSession()
    const [isBetaActive] = useState(process.env.NEXT_PUBLIC_IS_BETA === 'true')
    const [isEnrolling, setIsEnrolling] = useState(false)
    const [localEnrolled, setLocalEnrolled] = useState(false)

    const isBetaEnrolled = React.useMemo(() => {
        if (localEnrolled) return true
        
        const user = session?.user as { email?: string; plan?: string; tier?: string } | undefined
        // Logic for automatic whitelisting
        if (user?.email && AUTO_PRO_EMAILS.includes(user.email)) return true

        const plan = user?.plan || user?.tier
        return plan === 'pro' || plan === 'beta' || plan === 'beta_pro'
    }, [session?.user, localEnrolled])

    const enrollInBeta = async () => {
        setIsEnrolling(true)
        try {
            const res = await fetch("/api/beta/enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            })
            if (res.ok) {
                setLocalEnrolled(true)
                // Update local session
                await update({
                    ...session,
                    user: {
                        ...(session?.user || {}),
                        plan: 'beta_pro'
                    }
                })
                return true
            }
        } catch (err) {
            console.error("Beta enrollment failed:", err)
        } finally {
            setIsEnrolling(false)
        }
        return false
    }

    return (
        <BetaContext.Provider value={{ 
            isBetaActive, 
            isBetaEnrolled, 
            enrollInBeta, 
            loading: isEnrolling 
        }}>
            {children}
        </BetaContext.Provider>
    )
}

export const useBeta = () => useContext(BetaContext)
