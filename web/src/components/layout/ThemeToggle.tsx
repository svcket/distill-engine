"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="w-8 h-8 rounded-full bg-muted/20 border border-border" />

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 outline-none",
        "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        theme === "dark" && "border-brand/50 ring-2 ring-brand/10 shadow-sm"
      )}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-[15px] w-[15px] transition-all" />
      ) : (
        <Moon className="h-[15px] w-[15px] transition-all" />
      )}
    </button>
  )
}
