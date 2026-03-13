"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { StageResultPanel } from "@/components/StageResultView"
import { SourceCandidate } from "@/lib/mockData"
import {
    ArrowLeft, ExternalLink, Calendar, Clock, BarChart3,
    Loader2, FileText, Bot, Sparkles, Target, Edit3,
    ShieldCheck,
    X,
    Download, Play, MoreHorizontal
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import DQMCard, { DQMData } from "@/components/DQMCard"

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
    apiBody?: (id: string, params?: { type?: string, audience?: string, tone?: string }) => Record<string, string | undefined>
}

const STAGES: WorkflowStage[] = [
    { id: "judge", label: "Ingest Source", description: "Enrich source metadata and prepare for pipeline", icon: Bot, apiEndpoint: "/api/sources/score", apiBody: (id) => ({ sourceId: id }) },
    { id: "transcript", label: "Fetch Transcript", description: "Retrieve and index the source transcript", icon: FileText, apiEndpoint: "/api/transcripts/fetch", apiBody: (id) => ({ sourceId: id }) },
    { id: "refine", label: "Refine Transcript", description: "Clean artifacts, chunk into logical segments", icon: Edit3, apiEndpoint: "/api/transcripts/refine", apiBody: (id) => ({ transcriptId: id }) },
    { id: "packet", label: "Build Insight Packet", description: "Package top-density segments for extraction", icon: Target, apiEndpoint: "/api/packets/build", apiBody: (id) => ({ transcriptId: id }) },
    { id: "insights", label: "Extract Insights", description: "LLM-powered thesis, frameworks, takeaways", icon: Sparkles, apiEndpoint: "/api/insights/extract", apiBody: (id) => ({ transcriptId: id }) },
    { id: "angle", label: "Choose Angle", description: "Strategic angle and editorial framing", icon: Target, apiEndpoint: "/api/angles/strategize", apiBody: (id) => ({ transcriptId: id }) },
    { id: "draft", label: "Generate Draft", description: "Full editorial output with streaming", icon: Edit3, apiEndpoint: "/api/drafts/generate", apiBody: (id, params) => ({ transcriptId: id, type: params?.type, audience: params?.audience, tone: params?.tone }) },
    { id: "visual", label: "Visual Planning", description: "Suggest visuals, diagrams, quote cards", icon: Sparkles, apiEndpoint: "/api/visual", apiBody: (id) => ({ sourceId: id }) },
    { id: "qa", label: "Analyze Matrix", description: "Strategic matrix evaluation and editorial grading", icon: ShieldCheck, apiEndpoint: "/api/drafts/evaluate", apiBody: (id) => ({ sourceId: id }) },
    { id: "export", label: "Export Asset", description: "Package and deliver final outputs", icon: Download, apiEndpoint: "/api/assets/export", apiBody: (id) => ({ draftId: id }) },
]

export default function SourceMissionControl() {
    const { t } = useLanguage()
    const params = useParams()
    const id = params?.id as string

    const [source, setSource] = useState<SourceCandidate>({
        id: id,
        title: "Loading Source...",
        channel: "Loading...",
        url: "#",
        published: "—",
        duration: "—",
        status: "idle",
        score: 0
    })

    // Track which stages are completed
    const [completedStages, setCompletedStages] = useState<Set<StageId>>(() => {
        const initial = new Set<StageId>()
        if (source.score > 0) {
            initial.add("judge")
            initial.add("qa") // If score exists, evaluation completed historically
        }
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

    // Writing Intent states
    const [intentType, setIntentType] = useState<string>("blog_article")
    const [intentAudience, setIntentAudience] = useState<string>("general_reader")
    const [intentTone, setIntentTone] = useState<string>("conversational_editorial")

    // Expanded accordion IDs

    // Dropdown state
    const [isExportOpen, setIsExportOpen] = useState(false)

    // Processing logs
    const [logs, setLogs] = useState<{ event: string; time: string; status: "success" | "info" | "error" }[]>([
        { event: "Discovered via Scouter Agent", time: "Today", status: "info" }
    ])

    // Load persisted state on mount
    useEffect(() => {
        async function loadPersistedState() {
            // ═══ LOCAL MOCK BYPASS ═══
            if (id.startsWith("local-")) {
                setSource(s => ({
                    ...s,
                    title: "Local Import",
                    channel: "Device",
                    published: "Today",
                    status: "processing",
                    score: 0
                }))
                setLogs([{ event: "Local import session started", time: "Just now", status: "success" }])
                
                // Load from localStorage for local imports
                const localKey = `distill_results_${id}`;
                const storedResults = localStorage.getItem(localKey);
                if (storedResults) {
                    const parsed = JSON.parse(storedResults);
                    setStageResults(parsed);
                    setCompletedStages(new Set(Object.keys(parsed) as StageId[]));
                    setLogs(prev => [{ event: `${Object.keys(parsed).length} local stages restored`, time: "Just now", status: "success" }, ...prev]);
                }
                return
            }

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
                            url: stored.url || s.url,
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

                // Caching enhancement: try loading from localStorage first for immediate UI
                const cachedDqm = localStorage.getItem(`dqm_${id}`)
                if (cachedDqm) {
                    try {
                        const parsed = JSON.parse(cachedDqm)
                        setStageResults(prev => ({ ...prev, qa: parsed }))
                    } catch { /* fail */ }
                }
            } catch { /* silently fail */ }
        }
        loadPersistedState()
    }, [id])

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (isExportOpen && !target.closest('.export-dropdown-container')) {
                setIsExportOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [isExportOpen])

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
            const bodyPayload = stage.id === "draft"
                ? stage.apiBody(id, { type: intentType, audience: intentAudience, tone: intentTone })
                : stage.apiBody(id)

            // ═══ LOCAL MOCK BYPASS ═══
            // If the source is a local import, don't hit the real API
            if (id.startsWith("local-")) {
                await new Promise(r => setTimeout(r, 1500)) // Simulate network latency
                
                let mockData: any = { status: "success", message: `${stage.label} completed for local file` }
                
                if (stage.id === "judge") mockData = { result: { title: source.title, channel: "Local File", url: "file://local", score: 8 } }
                if (stage.id === "transcript") mockData = { result: { segments: [{ start: 0, text: "This is a mock transcript for your local file import. It contains the key arguments and discussions from the meeting." }] } }
                if (stage.id === "refine") mockData = { result: { segments: [{ text: "Refined and structured transcript data for the local file." }] } }
                if (stage.id === "insights") mockData = { result: { core_argument: "Local data is critical for strategic decision making.", key_claims: ["High security", "Fast processing"], memorable_quotes: ["Data is the new oil."] } }
                if (stage.id === "angle") mockData = { result: { recommended_format: "Podcast", framing_angle: "The future of local computing", working_titles: ["Local First Strategy"] } }
                if (stage.id === "draft") mockData = { result: { title: "Local Impact Analysis", content: "# Local Impact Analysis\n\nThis is a generated draft based on your local import.\n\n## Key Findings\n- Local files are processed faster.\n- Privacy is maintained." } }
                if (stage.id === "visual") mockData = { result: { visual_suggestions: [{ type: "chart", description: "Storage usage over time" }] } }
                
                const data = mockData
                // Store result
                setStageResults(prev => ({ ...prev, [stage.id]: data.result || data }))
                setCompletedStages(prev => new Set([...prev, stage.id]))
                
                // Persist to localStorage for local imports
                const localKey = `distill_results_${id}`;
                const existing = JSON.parse(localStorage.getItem(localKey) || "{}");
                localStorage.setItem(localKey, JSON.stringify({ ...existing, [stage.id]: data.result || data }));
                
                if (stage.id === "qa" && data.result?.total_score !== undefined) {
                    setSource(s => ({
                        ...s,
                        score: data.result.total_score,
                        status: "done",
                    }))
                    // Save DQM to specific cache for cross-module persistence
                    localStorage.setItem(`dqm_${id}`, JSON.stringify(data.result))
                }
                
                setLogs(prev => [{ event: `${stage.label} (Local Mode) completed`, time: "Just now", status: "success" }, ...prev])
                setExecutingStage(null)
                return
            }

            const res = await fetch(stage.apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Execution failed")

            // Store result
            setStageResults(prev => ({ ...prev, [stage.id]: data.result || data }))

            // Mark completed
            setCompletedStages(prev => new Set([...prev, stage.id]))

            // Update source score + rationale if this is the evaluation stage
            if (stage.id === "qa" && data.result?.score !== undefined) {
                setSource(s => ({
                    ...s,
                    score: data.result.score,
                    status: data.result.score >= 6 ? "done" : "failed",
                }))
                setStageResults(prev => ({ ...prev, qa_rationale: data.result.rationale }))
                // Save DQM to specific cache for cross-module persistence
                localStorage.setItem(`dqm_${id}`, JSON.stringify(data.result))
            }
            if (stage.id === "judge") {
                // If judge updates title/channel/url
                setSource(s => ({
                    ...s,
                    title: data.result?.title || s.title,
                    channel: data.result?.channel || s.channel,
                    url: data.result?.url || s.url,
                }))
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

        const startIndex = getActiveStageIndex()

        for (let i = startIndex; i < STAGES.length; i++) {
            const stage = STAGES[i]
            
            // ═══ LOCAL MOCK BYPASS ═══
            if (id.startsWith("local-")) {
                await new Promise(r => setTimeout(r, 800))
                
                const isAudio = id.toLowerCase().includes("mp3") || id.toLowerCase().includes("wav") || id.toLowerCase().includes("m4a") || id.toLowerCase().includes("audio");
                
                let mockData: any = { status: "success" }
                if (stage.id === "judge") mockData = { result: { title: source.title, channel: isAudio ? "Local Audio" : "Local Video", url: "file://local", score: 8 } }
                if (stage.id === "transcript") mockData = { result: { segments: [{ start: 0, text: isAudio ? "Mock transcript for audio meeting..." : "Transcript for local media..." }] } }
                if (stage.id === "refine") mockData = { result: { segments: [{ text: "Refined local transcript..." }] } }
                if (stage.id === "insights") mockData = { result: { core_argument: "Local data insights.", key_claims: ["Analysis ready"], memorable_quotes: ["Direct from source."] } }
                if (stage.id === "angle") mockData = { result: { recommended_format: "Article", framing_angle: "Local focus", working_titles: ["The Local Edge"] } }
                if (stage.id === "draft") mockData = { result: { title: "Draft from Local", content: "# Local Draft\n\nGenerated for local media." } }
                if (stage.id === "visual") mockData = { result: { visual_suggestions: [] } }
                if (stage.id === "qa") mockData = { 
                    result: { 
                        total_score: 82, 
                        decision: "Publish Ready", 
                        scores: { publishability: 82, seo: 85, aeo: 75 },
                        dimensions: { density: 8, depth: 8, utility: 8 },
                        rationale: "Good local baseline." 
                    } 
                }

                setStageResults(prev => ({ ...prev, [stage.id]: mockData.result || mockData }))
                setCompletedStages(prev => new Set([...prev, stage.id]))
                
                // Persist to localStorage
                const localKey = `distill_results_${id}`;
                const existing = JSON.parse(localStorage.getItem(localKey) || "{}");
                localStorage.setItem(localKey, JSON.stringify({ ...existing, [stage.id]: mockData.result || mockData }));
                
                if (stage.id === "qa") {
                     localStorage.setItem(`dqm_${id}`, JSON.stringify(mockData.result))
                }

                setLogs(prev => [{ event: `${stage.label} (Local Mode) completed`, time: "Just now", status: "success" }, ...prev])
                continue
            }

            if (!stage.apiEndpoint || !stage.apiBody) {
                // Skip stages without API endpoints (e.g., QA stub)
                setCompletedStages(prev => new Set([...prev, stage.id]))
                setLogs(prev => [{ event: `${stage.label} skipped (not implemented)`, time: "Just now", status: "info" }, ...prev])
                continue
            }

            // Pause at draft to await intent configuration if we auto-ran into it
            if (stage.id === "draft" && i !== startIndex) {
                setLogs(prev => [{ event: `Pipeline paused. Please configure Writing Intent before continuing.`, time: "Just now", status: "info" }, ...prev])
                setIsRunningAll(false)
                return // Stop auto-execution
            }

            setExecutingStage(stage.id)

            try {
                const bodyPayload = stage.id === "draft"
                    ? { ...stage.apiBody(id, { type: intentType, audience: intentAudience, tone: intentTone }), stream: false }
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

                if (stage.id === "qa" && data.result?.score !== undefined) {
                    setSource(s => ({
                        ...s,
                        score: data.result.score,
                        status: data.result.score >= 6 ? "done" : "failed",
                    }))
                    setStageResults(prev => ({ ...prev, qa_rationale: data.result.rationale }))
                    // Save DQM to specific cache for cross-module persistence
                    localStorage.setItem(`dqm_${id}`, JSON.stringify(data.result))
                }
                if (stage.id === "judge") {
                    setSource(s => ({
                        ...s,
                        title: data.result?.title || s.title,
                        channel: data.result?.channel || s.channel,
                        url: data.result?.url || s.url,
                    }))
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
                        <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" /> {t("viewAll")} {t("sources")}
                    </Link>

                    {error && (
                        <div className="p-3 rounded-xl bg-red-50/80 text-red-600 text-sm border border-red-100 backdrop-blur-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-start justify-between gap-6">
                            <h1 className="text-[26px] font-serif font-semibold tracking-tight text-balance leading-[1.2]">{source.title}</h1>
                            <div className="flex items-center gap-2 mt-1 shrink-0">
                                <div className="relative export-dropdown-container">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="w-10 h-10 p-0 rounded-full flex items-center justify-center"
                                        onClick={() => setIsExportOpen(!isExportOpen)}
                                        title="More options"
                                    >
                                        <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                    {isExportOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-52 bg-background border border-border rounded-xl shadow-lg p-1 animate-in fade-in slide-in-from-top-1 duration-200 z-50">
                                            <Link 
                                                href="/exports" 
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-brand" /> 
                                                {t("goToExportCenter") || "Go to Draft Studio"}
                                            </Link>
                                            <div className="h-px bg-border my-1" />
                                            <a 
                                                href={source.url === "#" ? undefined : source.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className={cn(
                                                    "w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group",
                                                    source.url === "#" && "opacity-30 cursor-not-allowed pointer-events-none"
                                                )}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-brand" /> 
                                                {t("visitOriginalSource") || "Visit Original Source"}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{source.channel || source.source_type || "Source"}</Badge>
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
                                        <span className="text-muted-foreground">{t("dateAdded")}</span>
                                        <span className="font-medium">{source.published}</span>
                                    </div>
                                    <div className="w-px h-4 bg-border/60 hidden sm:block" />
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="text-muted-foreground">{t("duration")}</span>
                                        <span className="font-medium">{source.duration}</span>
                                    </div>
                                    <div className="w-px h-4 bg-border/60 hidden sm:block" />
                                    <div className="flex items-center gap-2 text-sm">
                                        <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/70" />
                                        <span className="text-muted-foreground">{t("qualScore")}</span>
                                        <span className={cn("font-semibold tabular-nums", source.score >= 8 ? "text-emerald-600" : source.score >= 6 ? "text-amber-600" : source.score > 0 ? "text-red-500" : "text-muted-foreground")}>
                                            {source.score > 0 ? `${source.score}/10` : <span className="opacity-70 font-normal italic">{t("pending")}...</span>}
                                        </span>
                                        {source.score > 0 && (
                                            <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium", source.score >= 6 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                                                {source.score >= 8 ? "Excellent" : source.score >= 6 ? "Passable" : "Rejected"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ═══ PROGRESSIVE WORKFLOW ACTION STACK ═══ */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest font-serif">{t("pipelineStages")}</h2>
                                    {activeIndex < STAGES.length && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 h-7 text-[11px] rounded-lg font-normal"
                                            onClick={runFullPipeline}
                                            disabled={isRunningAll || !!executingStage}
                                        >
                                            {isRunningAll ? (
                                                <><Loader2 className="w-3 h-3 animate-spin" /> {t("processing")}...</>
                                            ) : (
                                                <><Play className="w-3 h-3" /> {t("run")} {t("all")}</>
                                            )}
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-0 relative">
                                    {STAGES.map((stage, i) => {
                                        const status = getStageStatus(i)
                                        const isExecuting = executingStage === stage.id
                                        const isCompleted = status === "completed"
                                        const isActive = status === "active"
                                        const isLocked = status === "locked"
                                        const hasResult = !!stageResults[stage.id]

                                        return (
                                            <div key={stage.id} className="group/stage relative flex">
                                                {/* Left Side: Timeline Column */}
                                                <div className="flex flex-col items-center w-10 shrink-0 relative">
                                                    {/* Vertical Connector Lines */}
                                                    <div className={cn(
                                                        "absolute w-0.5 transition-colors duration-500",
                                                        i === 0 ? "top-[13px] h-full" : i === STAGES.length - 1 ? "top-0 h-[13px]" : "top-0 h-full",
                                                        isCompleted ? "bg-emerald-500" : "bg-border/30"
                                                    )} />
                                                    
                                                    {/* Stage Node (Circle Indicator) */}
                                                    <div className={cn(
                                                        "relative z-10 w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-300 bg-white border-2 mt-3",
                                                        isCompleted && "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200",
                                                        isActive && "bg-white border-emerald-500 text-emerald-500 ring-4 ring-emerald-50 ring-offset-0",
                                                        isLocked && "bg-white border-border/60 text-muted-foreground/30",
                                                        isExecuting && "animate-pulse"
                                                    )}>
                                                        {isCompleted ? (
                                                            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                            </svg>
                                                        ) : isExecuting ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <div className={cn("w-1.5 h-1.5 rounded-full", isLocked ? "bg-muted-foreground/20" : "bg-emerald-500")} />
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right Side: Stage Content */}
                                                <div className={cn(
                                                    "flex-1 pb-10 transition-all duration-300 ml-2",
                                                    isLocked && "opacity-50"
                                                )}>
                                                    <div className="flex items-start justify-between group/row">
                                                        <div className="space-y-1 pt-3.5">
                                                            <h3 className={cn(
                                                                "text-[15px] font-medium transition-colors",
                                                                isCompleted || isActive ? "text-foreground" : "text-muted-foreground"
                                                            )}>
                                                                {stage.label}
                                                            </h3>
                                                            <p className="text-[13px] text-muted-foreground/70 leading-relaxed max-w-md">
                                                                {stage.description}
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center gap-4 pt-3.5">
                                                            {isActive && stage.apiEndpoint && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); executeStage(stage) }}
                                                                    disabled={isExecuting}
                                                                    className="text-[13px] flex items-center gap-1.5 text-brand font-medium hover:underline transition-all"
                                                                >
                                                                    {isExecuting ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Executing...</span></> : <span>Execute stage</span>}
                                                                </button>
                                                            )}
                                                            
                                                            {(isCompleted || (isActive && hasResult)) && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openPanel(stage) }}
                                                                    title="View stage results"
                                                                    className="px-4 py-1.5 rounded-full border border-border/60 bg-white text-[13px] font-medium text-foreground hover:bg-muted/30 transition-all group-hover/row:opacity-100"
                                                                >
                                                                    View
                                                                </button>
                                                            )}

                                                        </div>
                                                    </div>

                                                    {/* Writing Intent Setup for Draft Stage */}
                                                    {stage.id === "draft" && !isCompleted && isActive && (
                                                        <div className="mt-4 p-5 rounded-2xl bg-white border border-border/80 shadow-soft animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 max-w-2xl" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Bot className="w-4 h-4 text-brand" />
                                                                <h4 className="text-[12px] font-bold text-foreground uppercase tracking-wider font-serif">Writing Intent Strategy</h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                {/* Content Type */}
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Format</label>
                                                                    <select
                                                                        value={intentType}
                                                                        onChange={(e) => setIntentType(e.target.value)}
                                                                        title="Select content format"
                                                                        className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg px-2 w-full focus:ring-1 focus:ring-brand shadow-micro"
                                                                    >
                                                                        <option value="blog_article">Blog Article</option>
                                                                        <option value="essay">Thematic Essay</option>
                                                                        <option value="technical_breakdown">Technical Breakdown</option>
                                                                        <option value="explainer">Explainer</option>
                                                                        <option value="thought_leadership">Thought Leadership</option>
                                                                    </select>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Audience</label>
                                                                    <select
                                                                        value={intentAudience}
                                                                        onChange={(e) => setIntentAudience(e.target.value)}
                                                                        title="Select target audience"
                                                                        className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg px-2 w-full focus:ring-1 focus:ring-brand shadow-micro"
                                                                    >
                                                                        <option value="general_reader">General Reader</option>
                                                                        <option value="beginner">Beginner</option>
                                                                        <option value="professional">Professional / Peer</option>
                                                                        <option value="founder">Founder / Operator</option>
                                                                        <option value="technical">Technical Engineer</option>
                                                                    </select>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Tone</label>
                                                                    <select
                                                                        value={intentTone}
                                                                        onChange={(e) => setIntentTone(e.target.value)}
                                                                        title="Select voice and tone"
                                                                        className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg px-2 w-full focus:ring-1 focus:ring-brand shadow-micro"
                                                                    >
                                                                        <option value="conversational_editorial">Conversational</option>
                                                                        <option value="formal_authoritative">Formal</option>
                                                                        <option value="reflective_essay">Reflective</option>
                                                                        <option value="dense_information">Direct</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between mt-1 pt-4 border-t border-border/50">
                                                                <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                                                                    <Sparkles className="w-3 h-3" />
                                                                    Draft generation takes 30-45 seconds
                                                                </p>
                                                                <Button 
                                                                    size="sm" 
                                                                    className="h-8 px-4 rounded-xl gap-2 font-semibold shadow-brand/20 shadow-lg"
                                                                    onClick={(e) => { e.stopPropagation(); runFullPipeline(); }}
                                                                    disabled={isRunningAll || !!executingStage}
                                                                >
                                                                    {isRunningAll || executingStage === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5 fill-current"/>}
                                                                    Start Generation
                                                                </Button>
                                                             </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {activeIndex >= STAGES.length && (
                                    <div className="mt-6 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center backdrop-blur-sm">
                                        <p className="text-sm font-medium text-emerald-700">{t("allStagesComplete")}</p>
                                        <p className="text-xs text-emerald-600/80 mt-1">{t("sourceProcessed")}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN ═══ */}
                        <div className="space-y-5">

                            {/* Distill Quality Matrix */}
                            <DQMCard 
                                dqm={stageResults.qa as DQMData}
                            />

                            {/* Processing Logs — Static List */}
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest ml-1">
                                    {t("processingLog")}
                                </h3>
                                
                                <div className="rounded-xl border border-border/60 bg-background p-5 space-y-4 shadow-sm animate-in fade-in duration-500">
                                    <div className="space-y-0 text-left">
                                        {logs.map((log, i) => (
                                            <div key={i} className={cn(
                                                "flex items-start gap-3 py-3",
                                                i < logs.length - 1 && "border-b border-border/30"
                                            )}>
                                                <div className={cn(
                                                    "w-[6px] h-[6px] rounded-full mt-1.5 shrink-0",
                                                    log.status === "success" && "bg-emerald-500",
                                                    log.status === "info" && "bg-blue-400",
                                                    log.status === "error" && "bg-red-500"
                                                )} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-foreground leading-snug">{log.event}</p>
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
            </div>

            {/* ═══ SIDE PANEL / DETAIL DRAWER ═══ */}
            {panelContent && (
                <div className="w-[480px] shrink-0 border-l border-border/60 bg-background/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-right-4 duration-300">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-border/60 shrink-0">
                        <h3 className="text-[17px] font-semibold tracking-tight font-serif">{panelContent.title}</h3>
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
