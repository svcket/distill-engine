"use client"

import { SessionProvider } from "next-auth/react"
import { BetaProvider } from "@/context/BetaContext"
import { OneSignalProvider } from "./OneSignalProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BetaProvider>
        <OneSignalProvider>
          {children}
        </OneSignalProvider>
      </BetaProvider>
    </SessionProvider>
  )
}
