import { Outfit } from "next/font/google"
import "@/app/globals.css"
import { cn } from "@/lib/utils"

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: "--font-outfit",
})

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={cn(
        "min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased",
        outfit.variable
      )}>
        <nav className="h-16 border-b border-border/20 bg-zinc-900/50 backdrop-blur-md flex items-center px-10 justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white text-zinc-900 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="font-serif font-black text-xl italic">A</span>
              </div>
              <div className="flex flex-col -space-y-1">
                <span className="font-serif font-bold text-sm tracking-tight">Distill Admin</span>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Internal Entity</span>
              </div>
          </div>
          <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">System Active</span>
              </div>
              <div className="w-px h-4 bg-border/20" />
              <button className="text-[10px] font-bold text-zinc-500 hover:text-zinc-100 transition-colors uppercase tracking-widest">Log Out</button>
          </div>
        </nav>
        <main className="relative">
          {children}
        </main>
      </body>
    </html>
  )
}
