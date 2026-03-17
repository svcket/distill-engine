"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/Button"
import { Search } from "lucide-react"

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-8 rounded-3xl border border-border bg-muted/50 p-8 text-center backdrop-blur-xl shadow-soft">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-bold tracking-tight">Distill Engine</h1>
          <p className="text-sm text-muted-foreground">Unlock your personal editorial intelligence.</p>
        </div>

        <div className="space-y-4 pt-4">
          <Button 
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white text-black hover:bg-zinc-200"
          >
            <Search className="h-4 w-4" />
            Sign in with Google
          </Button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-muted px-2 text-muted-foreground">Authorized Access Only</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Powered by 3-Layer DOE Architecture
        </p>
      </div>
    </div>
  )
}
