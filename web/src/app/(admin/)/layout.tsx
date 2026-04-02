import "@/app/globals.css"
import { cn } from "@/lib/utils"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      "min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans antialiased"
    )}>
      {/* Isolated Admin Navigation (Very Minimal) */}
      <nav className="h-16 border-b border-border/40 bg-card/50 backdrop-blur-md flex items-center px-8 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center">
                <span className="text-white font-serif font-bold text-lg">D</span>
            </div>
            <span className="font-serif font-bold tracking-tight">Distill Admin</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Telemetry</span>
        </div>
      </nav>
      <main className="relative">
        {children}
      </main>
    </div>
  )
}
