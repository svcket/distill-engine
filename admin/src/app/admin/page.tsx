import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { 
    Users, 
    ShieldCheck, 
    Activity, 
    Mail, 
    Plus,
    CheckCircle2,
    XCircle,
    BarChart3
} from "lucide-react"
import { cn } from "@/lib/utils"

// Define interfaces for Prisma results
interface UserWithUsage {
    id: string;
    email: string | null;
    name: string | null;
    usage: {
        sourcesProcessed: number;
        draftsGenerated: number;
    } | null;
}

interface SourceHealth {
    id: string;
    title: string;
    status: string;
    userId: string;
}

export default async function AdminDashboard() {
    const session = await auth()
    
    // Hard security check
    const user = session?.user as { id: string; email: string; role?: string } | undefined
    if (user?.role !== "ADMIN" && user?.email !== "operator@distill.agency") {
        redirect("/")
    }

    const [users, whitelist, recentSources] = await Promise.all([
        prisma.user.findMany({ 
            include: { usage: true }, 
            take: 10, 
            orderBy: { id: "desc" } 
        }) as Promise<UserWithUsage[]>,
        (prisma as any).betaWhitelist.findMany({ 
            orderBy: { createdAt: "desc" } 
        }),
        prisma.source.findMany({ 
            take: 5, 
            orderBy: { createdAt: "desc" } 
        }) as Promise<SourceHealth[]>
    ])

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-serif font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Mission Control: Admin</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Dedicated tracking and management for the Distill team.</p>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Team Authenticated</span>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Total Users", val: users.length, icon: Users, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/5" },
                    { label: "Beta Invites", val: whitelist.length, icon: Mail, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-500/5" },
                    { label: "Active Pipelines", val: recentSources.filter((s: SourceHealth) => s.status === 'processing').length, icon: Activity, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/5" }
                ].map((stat, i) => (
                    <div key={i} className={cn("border border-border/40 p-6 rounded-3xl shadow-sm space-y-3", stat.bg)}>
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">{stat.label}</p>
                            <div className="p-2 bg-background rounded-xl border border-border/20 shadow-sm">
                                <stat.icon className={cn("w-5 h-5", stat.color)} />
                            </div>
                        </div>
                        <p className="text-4xl font-serif font-bold text-zinc-900 dark:text-zinc-100">{stat.val}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Whitelist Management */}
                <section className="bg-white dark:bg-zinc-900/50 border border-border/40 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-border/40 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/80">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-purple-500" />
                            <h2 className="font-bold font-serif text-lg text-foreground/80">Beta Whitelist</h2>
                        </div>
                        <button className="flex items-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-md active:scale-95">
                            <Plus className="w-4 h-4" />
                            New Invite
                        </button>
                    </div>
                    <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                        {whitelist.length === 0 ? (
                            <div className="p-16 text-center text-muted-foreground space-y-3">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
                                    <Mail className="w-8 h-8 opacity-20" />
                                </div>
                                <p className="text-sm font-medium">No active tester invites</p>
                            </div>
                        ) : (
                            whitelist.map((entry: { id: string; email: string; createdAt: Date }) => (
                                <div key={entry.id} className="p-5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">{entry.email}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground font-medium">Added {new Date(entry.createdAt).toLocaleDateString()}</span>
                                            <span className="h-1 w-1 rounded-full bg-zinc-300" />
                                            <span className="text-[10px] text-muted-foreground font-medium">System Role</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">Access Active</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Global Pipeline Health */}
                <section className="bg-white dark:bg-zinc-900/50 border border-border/40 rounded-3xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-border/40 flex items-center gap-3 bg-zinc-50/50 dark:bg-zinc-900/80">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        <h2 className="font-bold font-serif text-lg text-foreground/80">Telemetry Feed</h2>
                    </div>
                    <div className="divide-y divide-border/40">
                        {recentSources.map((source: SourceHealth) => (
                            <div key={source.id} className="p-5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold truncate max-w-[200px]">{source.title}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter",
                                            source.status === 'completed' ? "bg-emerald-500/10 text-emerald-600" :
                                            source.status === 'failed' ? "bg-red-500/10 text-red-600" :
                                            "bg-blue-500/10 text-blue-600"
                                        )}>
                                            {source.status}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-medium">• User: {source.userId.substring(0,8)}</span>
                                    </div>
                                </div>
                                {source.status === 'failed' && (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="p-5 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-border/20 text-center">
                        <button className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                            Deep Engine Diagnostics →
                        </button>
                    </div>
                </section>
            </div>
        </div>
    )
}
