"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { StageResultView, StageResultPanel } from "@/components/StageResultView"
import { SourceCandidate } from "@/lib/mockData"
import {
    ArrowLeft, ExternalLink, Calendar, Clock, BarChart3,
    Loader2, FileText, Bot, Sparkles, Target, Edit3, CheckCircle,
    ChevronDown, ChevronRight, X, ArrowRight, ShieldCheck, Download, Play
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"

// ─── Workflow Stage Definitions ────────────────────────────────────────
type StageId = "judge" | "transcript" | "refine" | "packet" | "insights" | "angle" | "draft" | "visual" | "qa" | "export"
type StageStatus = "completed" | "active" | "locked"

interface WorkflowStage {
    id: StageId
    label: string
    description: string
    icon: React.ElementType
    stub?: boolean   // Not yet implemented — renders as locked
    apiEndpoint?: string
    apiBody?: (id: string) => Record<string, string>
}

const STAGES: WorkflowStage[] = [
    { id: "judge", label: "Source Judge", description: "Score signal quality across any source type", icon: Bot, apiEndpoint: "/api/sources/score", apiBody: (id) => ({ sourceId: id }) },
    { id: "transcript", label: "Fetch Transcript", description: "Retrieve and index the source transcript", icon: FileText, apiEndpoint: "/api/transcripts/fetch", apiBody: (id) => ({ sourceId: id }) },
    { id: "refine", label: "Refine Transcript", description: "Clean artifacts, chunk into logical segments", icon: Edit3, apiEndpoint: "/api/transcripts/refine", apiBody: (id) => ({ transcriptId: id }) },
    { id: "packet", label: "Build Insight Packet", description: "Package top-density segments for extraction", icon: Target, apiEndpoint: "/api/packets/build", apiBody: (id) => ({ transcriptId: id }) },
    { id: "insights", label: "Extract Insights", description: "LLM-powered thesis, frameworks, takeaways", icon: Sparkles, apiEndpoint: "/api/insights/extract", apiBody: (id) => ({ transcriptId: id }) },
    { id: "angle", label: "Choose Angle", description: "Strategic angle and editorial framing", icon: Target, apiEndpoint: "/api/angles/strategize", apiBody: (id) => ({ transcriptId: id }) },
    { id: "draft", label: "Generate Draft", description: "Full editorial output with streaming", icon: Edit3, apiEndpoint: "/api/drafts/generate", apiBody: (id) => ({ transcriptId: id }) },
    { id: "visual", label: "Visual Planning", description: "Suggest visuals, diagrams, quote cards", icon: Sparkles, stub: true },
    { id: "qa", label: "Quality Review", description: "Confidence scoring and fact-checking", icon: ShieldCheck, stub: true },
    { id: "export", label: "Export Asset", description: "Package and deliver final outputs", icon: Download, apiEndpoint: "/api/assets/export", apiBody: (id) => ({ draftId: id }) },
]

export default function SourceMissionControl() {
    const params = useParams()
    const id = params?.id as string

    const [source, setSource] = useState<SourceCandidate>({
        id: id,
        title: "Loading...",
        channel: "YouTube",
        url: `https://youtube.com/watch?v=${id}`,
        published: "Recently",
        duration: "—",
        status: "idle",
        score: 0
    })

    // Track which stages are completed
    const [completedStages, setCompletedStages] = useState<Set<StageId>>(() => {
        const initial = new Set<StageId>()
        if (source.score > 0) initial.add("judge")
        return initial
    })

    // Stage results stored by ID
    const [stageResults, setStageResults] = useState<Record<string, unknown>>({})

    // Currently executing stage
    const [executingStage, setExecutingStage] = useState<StageId | null>(null)
    const [isRunningAll, setIsRunningAll] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Side panel state
    const [panelContent, setPanelContent] = useState<{ title: string; stageId: StageId; data: unknown } | null>(null)

    // Expanded accordion IDs
    const [expandedAccordions, setExpandedAccordions] = useState<Set<StageId>>(new Set())

    // Processing logs
    const [logs, setLogs] = useState<{ event: string; time: string; status: "success" | "info" | "error" }[]>([
        { event: "Discovered via Scouter Agent", time: "Today", status: "info" },
        ...(source.score > 0 ? [{ event: "Source Judge completed", time: "Today", status: "success" as const }] : [])
    ])

    // Load persisted state on mount
    useEffect(() => {
        async function loadPersistedState() {
            try {
                // Load source metadata and completed stages
                const storeRes = await fetch("/api/store")
                if (storeRes.ok) {
                    const data = await storeRes.json()
                    const stored = (data.sources || []).find((s: { id: string }) => s.id === id)
                    if (stored) {
                        // Always restore source metadata from store
                        setSource(s => ({
                            ...s,
                            title: stored.title || s.title,
                            channel: stored.channel || s.channel,
                            score: stored.score || s.score,
                            published: stored.published || s.published,
                            duration: stored.duration || s.duration,
                            status: stored.status || s.status,
                        }))
                        if (stored.completedStages && stored.completedStages.length > 0) {
                            setCompletedStages(new Set(stored.completedStages))
                            setLogs(prev => [
                                { event: `${stored.completedStages.length} stages restored from previous session`, time: "Previously", status: "success" as const },
                                ...prev
                            ])
                        }
                    }
                }

                // Load actual stage result data from disk
                const resultsRes = await fetch(`/api/store/results?sourceId=${id}`)
                if (resultsRes.ok) {
                    const { results } = await resultsRes.json()
                    if (results && Object.keys(results).length > 0) {
                        setStageResults(results)
                    }
                }
            } catch { /* silently fail */ }
        }
        loadPersistedState()
    }, [id])

    // Determine current active stage
    const getActiveStageIndex = (): number => {
        for (let i = 0; i < STAGES.length; i++) {
            if (!completedStages.has(STAGES[i].id)) return i
        }
        return STAGES.length // All done
    }

    const activeIndex = getActiveStageIndex()

    const getStageStatus = (index: number): StageStatus => {
        if (completedStages.has(STAGES[index].id)) return "completed"
        if (index === activeIndex) return "active"
        return "locked"
    }

    // Execute a workflow stage
    const executeStage = async (stage: WorkflowStage) => {
        if (!stage.apiEndpoint || !stage.apiBody) return
        setExecutingStage(stage.id)
        setError(null)

        try {
            const res = await fetch(stage.apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(stage.apiBody(id))
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Execution failed")

            // Store result
            setStageResults(prev => ({ ...prev, [stage.id]: data.result || data }))

            // Mark completed
            setCompletedStages(prev => new Set([...prev, stage.id]))

            // Update source score + rationale if judge
            if (stage.id === "judge" && data.result?.score !== undefined) {
                setSource(s => ({
                    ...s,
                    score: data.result.score,
                    status: data.result.score >= 6 ? "done" : "failed",
                    title: data.result.title || s.title,
                    channel: data.result.channel || s.channel,
                }))
                // Persist rationale for display
                setStageResults(prev => ({ ...prev, judge_rationale: data.result.rationale }))
            }

            // Add log
            setLogs(prev => [{ event: `${stage.label} completed`, time: "Just now", status: "success" }, ...prev])

            // Persist stage completion
            try {
                await fetch("/api/store", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "complete_stage", sourceId: id, stageId: stage.id })
                })
            } catch { /* silently fail */ }

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error"
            setError(msg)
            setLogs(prev => [{ event: `${stage.label} failed: ${msg}`, time: "Just now", status: "error" }, ...prev])
        } finally {
            setExecutingStage(null)
        }
    }

    // Run full pipeline — auto-chains all remaining stages
    const runFullPipeline = async () => {
        setIsRunningAll(true)
        setError(null)

        for (let i = getActiveStageIndex(); i < STAGES.length; i++) {
            const stage = STAGES[i]
            if (!stage.apiEndpoint || !stage.apiBody) {
                // Skip stages without API endpoints (e.g., QA stub)
                setCompletedStages(prev => new Set([...prev, stage.id]))
                setLogs(prev => [{ event: `${stage.label} skipped (not implemented)`, time: "Just now", status: "info" }, ...prev])
                continue
            }

            setExecutingStage(stage.id)

            try {
                const bodyPayload = stage.id === "draft"
                    ? { ...stage.apiBody(id), stream: false }
                    : stage.apiBody(id)

                const res = await fetch(stage.apiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bodyPayload)
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Execution failed")

                setStageResults(prev => ({ ...prev, [stage.id]: data.result || data }))
                setCompletedStages(prev => new Set([...prev, stage.id]))

                if (stage.id === "judge" && data.result?.score !== undefined) {
                    setSource(s => ({
                        ...s,
                        score: data.result.score,
                        status: data.result.score >= 6 ? "done" : "failed",
                        title: data.result.title || s.title,
                        channel: data.result.channel || s.channel,
                    }))
                    setStageResults(prev => ({ ...prev, judge_rationale: data.result.rationale }))
                }

                setLogs(prev => [{ event: `${stage.label} completed`, time: "Just now", status: "success" }, ...prev])

                // Persist completion
                try {
                    await fetch("/api/store", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "complete_stage", sourceId: id, stageId: stage.id })
                    })
                } catch { /* silently fail */ }

            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Unknown error"
                setError(msg)
                setLogs(prev => [{ event: `Pipeline stopped: ${stage.label} failed — ${msg}`, time: "Just now", status: "error" }, ...prev])
                setExecutingStage(null)
                setIsRunningAll(false)
                return // Stop pipeline on error
            }

            setExecutingStage(null)
        }

        setIsRunningAll(false)
        setLogs(prev => [{ event: "Full pipeline completed successfully", time: "Just now", status: "success" }, ...prev])
    }

    const toggleAccordion = (id: StageId) => {
        setExpandedAccordions(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const openPanel = (stage: WorkflowStage) => {
        const data = stageResults[stage.id]
        if (data) setPanelContent({ title: stage.label, stageId: stage.id, data })
    }

    return (
        <div className="flex h-full">
            {/* Main Content Area */}
            <div className={cn("flex-1 overflow-y-auto transition-all duration-300", panelContent ? "pr-0" : "")}>
                <div className="p-8 max-w-[1100px] mx-auto space-y-8 animate-in fade-in duration-500">

                    {/* Back Link */}
                    <Link href="/sources" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-all duration-200 group">
                        <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" /> Back to Sources
                    </Link>

                    {error && (
                        <div className="p-3 rounded-xl bg-red-50/80 text-red-600 text-sm border border-red-100 backdrop-blur-sm">
                            {error}
                        </div>
                    )}

                    {/* ═══ IDENTITY BLOCK — Full Width Above Grid ═══ */}
                    <div className="space-y-2">
                        <div className="flex items-start justify-between gap-6">
                            <h1 className="text-[26px] font-serif font-semibold tracking-tight text-balance leading-[1.2]">{source.title}</h1>
                            <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label="View original on YouTube" className="shrink-0 mt-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200">
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{source.channel}</Badge>
                        </div>
                    </div>

                    {/* ═══ TWO-COLUMN GRID — Starts at same height ═══ */}
                    <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">

                        {/* ═══ LEFT COLUMN ═══ */}
                        <div className="space-y-8">

                            {/* Metadata Row — horizontal, single line */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-muted/30 border border-border/60 flex-wrap">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="text-muted-foreground">Published</span>
                                        <span className="font-medium">{source.published}</span>
                                    </div>
                                    <div className="w-px h-4 bg-border/60 hidden sm:block" />
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="text-muted-foreground">Duration</span>
                                        <span className="font-medium">{source.duration}</span>
                                    </div>
                                    <div className="w-px h-4 bg-border/60 hidden sm:block" />
                                    <div className="flex items-center gap-2 text-sm">
                                        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="text-muted-foreground">Score</span>
                                        <span className={cn("font-semibold tabular-nums", source.score >= 8 ? "text-emerald-600" : source.score >= 6 ? "text-amber-600" : source.score > 0 ? "text-red-500" : "text-muted-foreground")}>
                                            {source.score > 0 ? `${source.score}/10` : "—"}
                                        </span>
                                        {source.score > 0 && (
                                            <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium", source.score >= 6 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                                                {source.score >= 8 ? "Approved" : source.score >= 6 ? "Accepted" : "Rejected"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Judge Rationale */}
                                {Boolean(stageResults.judge_rationale) && (
                                    <div className="px-4 py-2.5 rounded-lg bg-muted/20 border border-border/40">
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            <span className="font-medium text-foreground/70">Decision rationale: </span>
                                            {String(stageResults.judge_rationale ?? "")}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* ═══ PROGRESSIVE WORKFLOW ACTION STACK ═══ */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">Pipeline Stages</h2>
                                    {activeIndex < STAGES.length && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 h-7 text-[11px] rounded-lg"
                                            onClick={runFullPipeline}
                                            disabled={isRunningAll || !!executingStage}
                                        >
                                            {isRunningAll ? (
                                                <><Loader2 className="w-3 h-3 animate-spin" /> Running...</>
                                            ) : (
                                                <><Play className="w-3 h-3" /> Run All</>
                                            )}
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-1 relative">
                                    {STAGES.map((stage, i) => {
                                        const status = getStageStatus(i)
                                        const isExecuting = executingStage === stage.id
                                        const isCompleted = status === "completed"
                                        const isActive = status === "active"
                                        const isLocked = status === "locked"
                                        const hasResult = !!stageResults[stage.id]
                                        const isExpanded = expandedAccordions.has(stage.id)

                                        return (
                                            <div key={stage.id} className="relative">
                                                {/* Connector Line */}
                                                {i < STAGES.length - 1 && (
                                                    <div className={cn(
                                                        "absolute left-[15px] top-[40px] w-0.5 h-[calc(100%-20px)] z-0 transition-colors duration-300",
                                                        isCompleted ? "bg-emerald-200" : "bg-border/40"
                                                    )} />
                                                )}

                                                <div className={cn(
                                                    "relative z-10 flex items-start gap-3.5 py-3.5 px-4 rounded-xl transition-all duration-200",
                                                    isActive && "bg-brand/[0.04] border border-brand/15 shadow-sm",
                                                    isCompleted && "hover:bg-muted/30 cursor-pointer",
                                                    stage.stub && !isCompleted && "opacity-40 cursor-not-allowed",
                                                    !stage.stub && isLocked && "opacity-35"
                                                )}
                                                    onClick={() => {
                                                        if (isCompleted && hasResult) {
                                                            toggleAccordion(stage.id)
                                                        }
                                                    }}
                                                >
                                                    {/* Status Indicator */}
                                                    <div className={cn(
                                                        "w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 transition-all duration-300",
                                                        isCompleted && "bg-emerald-500 text-white shadow-sm shadow-emerald-200",
                                                        isActive && "bg-brand/10 ring-1 ring-brand/30 text-brand",
                                                        isLocked && "bg-muted/60 text-muted-foreground/50",
                                                        isExecuting && "animate-pulse"
                                                    )}>
                                                        {isCompleted ? (
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                        ) : isExecuting ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <stage.icon className="w-3.5 h-3.5" />
                                                        )}
                                                    </div>

                                                    {/* Label and CTA */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div>
                                                                <p className={cn(
                                                                    "text-sm font-medium",
                                                                    isCompleted && "text-foreground",
                                                                    isActive && "text-brand font-semibold",
                                                                    isLocked && "text-muted-foreground"
                                                                )}>
                                                                    {stage.label}
                                                                </p>
                                                                <p className={cn(
                                                                    "text-xs mt-0.5",
                                                                    isActive ? "text-brand/70" : "text-muted-foreground"
                                                                )}>
                                                                    {stage.description}
                                                                </p>
                                                            </div>

                                                            {/* Action Buttons */}
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {isActive && stage.apiEndpoint && (
                                                                    <Button
                                                                        size="sm"
                                                                        className="gap-1.5 h-8 text-xs rounded-lg shadow-sm"
                                                                        onClick={(e) => { e.stopPropagation(); executeStage(stage) }}
                                                                        disabled={isExecuting}
                                                                    >
                                                                        {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                                                        {isExecuting ? "Running..." : "Execute"}
                                                                    </Button>
                                                                )}
                                                                {isCompleted && hasResult && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); openPanel(stage) }}
                                                                        className="text-xs text-muted-foreground hover:text-brand transition-colors px-2 py-1 rounded-md hover:bg-muted"
                                                                    >
                                                                        Inspect
                                                                    </button>
                                                                )}
                                                                {isCompleted && (
                                                                    isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Accordion content for completed steps */}
                                                        {isCompleted && isExpanded && hasResult && (
                                                            <div className="mt-3 p-4 rounded-xl bg-muted/30 border border-border/50 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200 backdrop-blur-sm">
                                                                <div className="max-h-48 overflow-y-auto">
                                                                    <StageResultView stageId={stage.id} data={stageResults[stage.id] as Record<string, unknown>} compact />
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openPanel(stage) }}
                                                                    className="mt-3 text-brand hover:underline text-xs font-medium"
                                                                >
                                                                    Open full view →
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {activeIndex >= STAGES.length && (
                                    <div className="mt-6 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center backdrop-blur-sm">
                                        <p className="text-sm font-medium text-emerald-700">All pipeline stages complete.</p>
                                        <p className="text-xs text-emerald-600/80 mt-1">This source has been fully processed and exported.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN ═══ */}
                        <div className="space-y-5">

                            {/* Decision Rationale */}
                            <div className="rounded-xl border border-border/60 bg-background p-5 space-y-4">
                                <div>
                                    <h3 className="text-[13px] font-semibold tracking-tight">Decision Rationale</h3>
                                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">Why this source was evaluated</p>
                                </div>
                                {source.score > 0 ? (
                                    <div className="space-y-2.5">
                                        <Badge variant="success">High Signal</Badge>
                                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                                            Source is an established reference. Topic matches NorthStar criteria. Very low clickbait markers.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-[12px] text-muted-foreground italic">Run the Source Judge to generate a rationale.</p>
                                )}
                            </div>

                            {/* Processing Logs */}
                            <div className="rounded-xl border border-border/60 bg-background p-5 space-y-4">
                                <h3 className="text-[13px] font-semibold tracking-tight">Processing Log</h3>
                                <div className="space-y-0">
                                    {logs.map((log, i) => (
                                        <div key={i} className={cn(
                                            "flex items-start gap-3 py-3",
                                            i < logs.length - 1 && "border-b border-border/30"
                                        )}>
                                            <div className={cn(
                                                "w-[6px] h-[6px] rounded-full mt-1 shrink-0",
                                                log.status === "success" && "bg-emerald-500",
                                                log.status === "info" && "bg-blue-400",
                                                log.status === "error" && "bg-red-500"
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-medium text-foreground leading-snug">{log.event}</p>
                                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{log.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ SIDE PANEL / DETAIL DRAWER ═══ */}
            {panelContent && (
                <div className="w-[480px] shrink-0 border-l border-border/60 bg-background/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-right-4 duration-300">
                    <div className="h-14 flex items-center justify-between px-6 border-b border-border/60 shrink-0">
                        <h3 className="text-[13px] font-semibold tracking-tight">{panelContent.title}</h3>
                        <button onClick={() => setPanelContent(null)} aria-label="Close panel" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                        <StageResultPanel stageId={panelContent.stageId} data={panelContent.data as Record<string, unknown>} />
                    </div>
                </div>
            )}
        </div>
    )
}
