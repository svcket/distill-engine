import { 
    HelpCircle, Target, Activity, BarChart3, ShieldCheck, 
    BrainCircuit, User, Eye, Layout, CheckCircle2, 
    AlertCircle, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/Tooltip"

export interface DQMData {
    scores: {
        publishability: number
        seo: number
        aeo: number
        source_grounding: number
        insight_density: number
        humanness: number
        clarity: number
        structure: number
    }
    strengths?: string[]
    risks?: string[]
    suggestions?: string[]
    rationale?: string
}

interface DQMCardProps {
    dqm?: DQMData
    showRationale?: boolean
    variant?: "collapsed" | "full"
    onExpand?: () => void
}

const DQMCard = ({ 
    dqm, 
    showRationale = true,
    variant = "full",
    onExpand
}: DQMCardProps) => {
    // Determine if we are currently analyzing based on whether dqm data is missing
    // or we can pass a simple prop if needed, but per the plan we move it to header.
    const isQAing = !dqm && variant === "collapsed"; 
    const isCollapsed = variant === "collapsed"
    return (
        <TooltipProvider>
            <div className="space-y-8">
                {/* Publishability Score */}
                <div className="bg-white p-4 rounded-2xl shadow-soft border border-border/60 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand/5 rounded-full blur-2xl group-hover:bg-brand/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Distill Quality Matrix</h3>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button 
                                            className="text-muted-foreground/40 hover:text-brand transition-colors" 
                                            title="DQM Info"
                                            aria-label="DQM Information"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px] text-[11px]">
                                        The Distill Quality Matrix (DQM) measures the editorial readiness and strategic performance of your content.
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <span className="text-lg font-serif text-foreground">Publishability</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className={cn(
                                "text-[28px] font-serif font-bold tracking-tight",
                                !dqm && "text-muted-foreground/40",
                                dqm && "text-foreground"
                            )}>
                                {dqm && dqm.scores ? dqm.scores.publishability : "—"}
                            </span>
                            <span className="text-[14px] text-muted-foreground/40 font-medium ml-1.5 self-end mb-1">/ 100</span>
                        </div>
                    </div>
                    
                    <div className="space-y-4 relative z-10">
                        {dqm && dqm.scores && (
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={cn(
                                            "h-full rounded-full transition-all duration-1000 ease-out",
                                            (dqm && dqm.scores) 
                                                ? (dqm.scores.publishability >= 90 ? "bg-emerald-500" : dqm.scores.publishability >= 75 ? "bg-brand" : "bg-amber-500")
                                                : "bg-muted"
                                        )} 
                                        style={{ width: `${(dqm && dqm.scores) ? dqm.scores.publishability : 0}%` } as React.CSSProperties} 
                                    />
                            </div>
                        )}

                        {!dqm && isCollapsed && (
                            <div className="py-1">
                                <div className="h-[1px] w-full bg-border/60 mb-3" />
                                <div className="flex items-center gap-2 px-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse shrink-0" />
                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {isQAing ? "Analyzing matrix..." : "Pending analysis"}
                                    </p>
                                </div>
                                <div className="h-[1px] w-full bg-border/60 mt-3" />
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 group/metric transition-colors hover:border-purple-200 dark:hover:border-purple-800">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <p className="text-[11px] text-purple-700/60 dark:text-purple-400/60 uppercase tracking-widest font-bold">SEO</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button 
                                                    className="text-purple-400/40 hover:text-purple-600 transition-colors" 
                                                    title="SEO Info"
                                                    aria-label="SEO Information"
                                                >
                                                    <HelpCircle className="w-2.5 h-2.5" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-[10px]">
                                                Search Engine Optimization score.
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Target className={cn(
                                        "w-2.5 h-2.5 text-purple-500",
                                        !dqm && "text-muted-foreground/30"
                                    )} />
                                </div>
                                <p className={cn(
                                    "text-sm font-bold text-foreground",
                                    !dqm && "text-muted-foreground/30"
                                )}>{(dqm && dqm.scores) ? dqm.scores.seo : "-"}</p>
                            </div>
                            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors hover:border-cyan-200 dark:hover:border-cyan-800">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <p className="text-[11px] text-cyan-700/60 dark:text-cyan-400/60 uppercase tracking-widest font-bold">AEO</p>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button 
                                                    className="text-cyan-400/40 hover:text-cyan-600 transition-colors" 
                                                    title="AEO Info"
                                                    aria-label="AEO Information"
                                                >
                                                    <HelpCircle className="w-2.5 h-2.5" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-[10px]">
                                                Answer Engine Optimization score.
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    <Activity className={cn(
                                        "w-2.5 h-2.5 text-cyan-500",
                                        !dqm && "text-muted-foreground/30"
                                    )} />
                                </div>
                                <p className={cn(
                                    "text-sm font-bold text-foreground",
                                    !dqm && "text-muted-foreground/30"
                                )}>{(dqm && dqm.scores) ? dqm.scores.aeo : "-"}</p>
                            </div>
                        </div>
                    </div>
                    
                    {isCollapsed && dqm && dqm.scores && (
                        <div className="mt-4 pt-4 border-t border-border/40 relative z-10 flex justify-center">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onExpand?.() }}
                                className="text-[11px] font-bold text-brand uppercase tracking-widest hover:underline transition-all"
                            >
                                View Full Matrix →
                            </button>
                        </div>
                    )}
                </div>

                {/* Detailed DQM Breakdown */}
                {!isCollapsed && dqm && dqm.scores ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500 pb-10">
                        <div>
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                                <BarChart3 className="w-3.5 h-3.5" /> Matrix Dimensions
                            </h3>
                            <div className="bg-white border border-border/40 rounded-2xl overflow-hidden divide-y divide-border/20">
                                {[
                                    { label: "Source Grounding", score: dqm.scores.source_grounding, icon: ShieldCheck, tooltip: "Accuracy and alignment with source material." },
                                    { label: "Insight Density", score: dqm.scores.insight_density, icon: BrainCircuit, tooltip: "Concentration of unique perspectives and data points." },
                                    { label: "Humanness", score: dqm.scores.humanness, icon: User, tooltip: "Natural flow and editorial personality." },
                                    { label: "Clarity", score: dqm.scores.clarity, icon: Eye, tooltip: "Readability and ease of comprehension." },
                                    { label: "Structural quality", score: dqm.scores.structure, icon: Layout, tooltip: "Logical organization and hierarchy." }
                                ].map((m, i) => (
                                    <div key={i} className="px-4 py-3 flex items-center justify-between group hover:bg-muted/5 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 rounded-lg bg-muted group-hover:bg-white transition-colors">
                                                <m.icon className="w-3 h-3 text-muted-foreground" />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-medium text-foreground/80">{m.label}</span>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button 
                                                            className="text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
                                                            title={`${m.label} Information`}
                                                            aria-label={`${m.label} Information`}
                                                        >
                                                            <HelpCircle className="w-2.5 h-2.5" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="right" className="text-[10px]">
                                                        {m.tooltip}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "text-xs font-bold",
                                            m.score >= 80 ? "text-emerald-600" : m.score >= 60 ? "text-brand" : "text-amber-600"
                                        )}>{m.score}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Strengths */}
                        {dqm?.strengths && dqm.strengths.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Strengths</h3>
                                <div className="space-y-2">
                                    {dqm.strengths.map((s, i) => (
                                        <div key={i} className="flex gap-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                            <p className="text-[11px] font-medium text-emerald-900 leading-tight">{s}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Risks */}
                         {dqm?.risks && dqm.risks.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Risks</h3>
                                <div className="space-y-2">
                                    {dqm.risks.map((r, i) => (
                                        <div key={i} className="flex gap-2 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                                            <p className="text-[11px] font-medium text-amber-900 leading-tight">{r}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggestions */}
                        {dqm?.suggestions && dqm.suggestions.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 text-brand">Suggestions</h3>
                                <div className="bg-brand/5 border border-brand/10 p-4 rounded-xl space-y-2">
                                    {dqm.suggestions.map((s, i) => (
                                        <div key={i} className="flex gap-2">
                                            <Zap className="w-3 h-3 text-brand mt-0.5 shrink-0 fill-brand" />
                                            <p className="text-[11px] text-brand font-medium leading-relaxed">{s}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Decision Rationale */}
                        {showRationale && dqm?.rationale && (
                            <div className="animate-in fade-in duration-700">
                                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Decision Rationale</h3>
                                <div className="bg-brand/[0.03] dark:bg-brand/[0.05] border border-brand/10 p-4 rounded-xl relative">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand/20 rounded-l-xl" />
                                    <p className="text-[11px] text-muted-foreground leading-relaxed font-serif italic text-pretty">
                                        &ldquo;{dqm.rationale}&rdquo;
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </TooltipProvider>
    )
}

export default DQMCard
