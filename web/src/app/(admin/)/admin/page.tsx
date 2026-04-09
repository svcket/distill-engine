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
        redirect("/") // Redirect home for non-admins to prevent "accessing from engine"
    }

    const [users, whitelist, recentSources] = await Promise.all([
        prisma.user.findMany({ 
            include: { usage: true }, 
            take: 10, 
            orderBy: { id: "desc" } 
        }) as Promise<UserWithUsage[]>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    <h1 className="text-3xl font-serif font-bold tracking-tight">Mission Control: Admin</h1>
                    <p className="text-muted-foreground mt-1">Manage engine access and monitor global pipeline health.</p>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-tighter">Verified Admin Access</span>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Total Users", val: users.length, icon: Users, color: "text-blue-500" },
                    { label: "Beta Whitelist", val: whitelist.length, icon: Mail, color: "text-purple-500" },
                    { label: "Active Pipelines", val: recentSources.filter((s: SourceHealth) => s.status === 'processing').length, icon: Activity, color: "text-emerald-500" }
                ].map((stat, i) => (
                    <div key={i} className="bg-card border border-border/40 p-6 rounded-2xl shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">{stat.label}</p>
                            <stat.icon className={cn("w-5 h-5", stat.color)} />
                        </div>
                        <p className="text-4xl font-serif font-bold">{stat.val}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Whitelist Management */}
                <section className="bg-card border border-border/40 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-border/40 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-purple-500" />
                            <h2 className="font-bold font-serif text-lg text-foreground/80">Beta Whitelist</h2>
                        </div>
                        <button className="flex items-center gap-2 bg-foreground text-background px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
                            <Plus className="w-3.5 h-3.5" />
                            Invite Tester
                        </button>
                    </div>
                    <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                        {whitelist.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground space-y-2">
                                <Mail className="w-8 h-8 mx-auto opacity-20" />
                                <p className="text-sm font-medium">No active invites</p>
                            </div>
                        ) : (
                            whitelist.map((entry: { id: string; email: string; createdAt: Date }) => (
                                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-accent/5 transition-colors">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-semibold">{entry.email}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                                            Added {new Date(entry.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-zinc-500">WHITELISTED</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Global Pipeline Health */}
                <section className="bg-card border border-border/40 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-border/40 flex items-center gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        <h2 className="font-bold font-serif text-lg text-foreground/80">Global Health</h2>
                    </div>
                    <div className="divide-y divide-border/40">
                        {recentSources.map((source: SourceHealth) => (
                            <div key={source.id} className="p-4 flex items-center justify-between hover:bg-accent/5">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold truncate max-w-[240px]">{source.title}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                                            source.status === 'completed' ? "bg-emerald-500/10 text-emerald-600" :
                                            source.status === 'failed' ? "bg-red-500/10 text-red-600" :
                                            "bg-blue-500/10 text-blue-600"
                                        )}>
                                            {source.status}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-medium">• {source.userId.substring(0,8)}</span>
                                    </div>
                                </div>
                                {source.status === 'failed' && (
                                    <XCircle className="w-5 h-5 text-red-500" />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-zinc-50/80 dark:bg-zinc-900/80 border-t border-border/20 text-center">
                        <button className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                            View Full Telemetry
                        </button>
                    </div>
                </section>
            </div>
        </div>
    )
}
