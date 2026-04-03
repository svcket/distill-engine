"use client"

import React, { useState } from "react"
import { signIn } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Mail, ArrowRight } from "lucide-react"

export default function LoginScreen() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // In dev, NextAuth will log the verification link to the console
      await signIn("resend", { email })
    } catch (error) {
      console.error("Login bug, dawg:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/sources" })
  }

  const handleDevLogin = async () => {
    // Dev access via the hidden button — use credentials bypass directly
    // Email is not required here; the credentials provider only checks the password
    setIsLoading(true)
    try {
      await signIn("credentials", { 
        email: "nsikan.design@gmail.com",
        password: "dawg", 
        callbackUrl: "/sources",
        redirect: true,
      })
    } catch {
      /* Intentionally silent — redirect handles success */
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0C1117] flex items-center justify-center p-6 font-sans selection:bg-brand/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-brand/3 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-md z-10">
        {/* Logo / Brand Header */}
        <div className="text-center mb-10 group cursor-default">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-4 group-hover:border-brand/30 transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <div className="w-6 h-6 bg-brand rounded-md flex items-center justify-center shadow-sm">
                <div className="w-2 h-2 bg-[#0C1117] rounded-full" />
            </div>
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-white mb-2">Distill Engine</h1>
          <p className="text-white/40 text-sm font-light">Compounding research into builder intelligence.</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden relative group">
          <div className="space-y-6 animate-in fade-in duration-700">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-[11px] uppercase tracking-widest text-white/40 ml-1">
                  Direct Email Entry
                </label>
                <div className="relative group/input">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dawg@distill.agency"
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-11 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within/input:text-white/60 transition-colors" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full h-12 bg-brand text-white font-medium text-sm rounded-xl hover:bg-emerald-400 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group/btn disabled:opacity-50 disabled:active:scale-100 shadow-sm",
                  email.length === 0 && "opacity-60"
                )}
              >
                {isLoading ? "Warping..." : "Send Magic Link"}
                {!isLoading && <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em]">
                <span className="bg-[#0C1117]/50 px-2 text-white/20 backdrop-blur-sm">OR</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full h-12 bg-white rounded-xl text-sm text-black hover:bg-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group/google font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.16l3.66 2.84c.87-2.6 3.3-4.53 12-5.38z"
                />
              </svg>
              Sign in with Google
            </button>

            {process.env.NODE_ENV === "development" && (
              <button
                onClick={handleDevLogin}
                className="w-full h-10 text-[10px] text-white/20 hover:text-white/40 transition-all uppercase tracking-[0.2em]"
              >
                — Developer Access —
              </button>
            )}

            {process.env.NODE_ENV === "development" && email === "nsikan.design@gmail.com" && (
              <button
                onClick={async () => {
                  setIsLoading(true)
                  try {
                    await signIn("credentials", { 
                      password: "dawg", 
                      email: "nsikan.design@gmail.com",
                      callbackUrl: "/sources",
                      redirect: true,
                    })
                  } catch {
                    /* Intentionally silent */
                  } finally {
                    setIsLoading(false)
                  }
                }}
                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 uppercase tracking-widest hover:bg-emerald-500/20 transition-all font-bold animate-in fade-in slide-in-from-top-2"
              >
                ⚡ Instant Sigma Access
              </button>
            )}
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-[10px] text-white/10 uppercase tracking-[0.3em] font-light">
          Secure Editorial Environment • v2.0
        </p>
      </div>
    </div>
  )
}
