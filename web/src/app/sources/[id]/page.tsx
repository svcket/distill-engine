"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { StageResultPanel } from "@/components/StageResultView"
import { MissionControlSkeleton, PanelSkeleton } from "@/components/ui/Skeletons"
import { SourceCandidate } from "@/lib/mockData"
import { 
    ArrowLeft, FileText, Bot, Sparkles, Target, Edit3, 
    ShieldCheck, Check, ChevronDown, RefreshCw, Play, Share2, 
    ExternalLink, MoreHorizontal, Trash2, X, Calendar, Clock, BarChart3
} from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { cn, formatDuration } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "@/lib/supabase"

type StageId = "judge" | "transcript" | "refine" | "cluster" | "summary" | "packet" | "insights" | "angle" | "draft" | "qa" | "socialise" | "export"
type StageStatus = "completed" | "active" | "locked"

interface StagePayload {
    status?: string;
    result?: StageResultData; 
    data?: StageResultData | null;
    payload?: StageResultData | null;
    summary?: string;
    scores?: {
        publishability?: number;
    };
    total_score?: number;
    score?: number;
    duration?: number | string;
    title?: string;
    channel?: string;
    url?: string;
    error?: string;
    message?: string;
    type?: string;
    text?: string;
}

interface StreamChunk {
    type: "status" | "chunk" | "error" | "success";
    text?: string;
    status?: string;
    message?: string;
    data?: StageResultData;
}


interface WorkflowStage {
    id: StageId
    label: string
    description: string
    icon: React.ElementType
    stub?: boolean   // Not yet implemented — renders as locked
    apiEndpoint?: string
    apiBody?: (id: string, params?: { type?: string, audience?: string, tone?: string }) => Record<string, string | undefined>
    hidden?: boolean // UX optimization: run in background but don't show to user
}

interface JudgeResult { score: number; status: string; rationale?: string; title?: string; channel?: string; url?: string; detected_language?: string; language_warning?: string | null; }
interface TranscriptResult { segments: { start: number; text: string; duration?: number }[]; segment_count: number; status: string; duration?: number; }
interface RefineResult { segments: { text: string }[]; segment_count: number; status: string; }
interface SummaryResult { summary: string; status: string; }
interface PacketResult { source_id: string; status: string; }
interface InsightsResult { core_argument: string; key_claims: string[]; supporting_examples: string[]; frameworks: unknown[]; memorable_quotes: string[]; status: string; }
interface StrategyResult { recommended_format: string; secondary_formats: string[]; target_audience: string; framing_angle: string; working_titles: string[]; rationale: string; status: string; }
interface DraftResult { content: string; title: string; word_count: number; status: string; }
interface QAResult { total_score: number; decision: string; scores: { publishability: number; seo: number; aeo: number }; dimensions: Record<string, number>; rationale: string; status: string; }
interface SocialiseResult { hook?: string; hooks?: string[]; thread?: string[]; cta?: string; result?: { hook?: string; hooks?: string[]; thread?: string[]; cta?: string } }

type StageResultData = JudgeResult | TranscriptResult | RefineResult | SummaryResult | PacketResult | InsightsResult | StrategyResult | DraftResult | QAResult | SocialiseResult | Record<string, unknown>;

const STAGES: WorkflowStage[] = [
    { id: "judge", label: "Judge Alignment", description: "Enrich source metadata and evaluate against NorthStar Profile", icon: Bot, apiEndpoint: "/api/sources/score", apiBody: (sid) => ({ source_id: sid }), hidden: true },
    { id: "transcript", label: "Content Sourcing", description: "Acquire official context and raw content signals", icon: FileText, apiEndpoint: "/api/transcripts/fetch", apiBody: (sid) => ({ source_id: sid }), hidden: true },
    { id: "refine", label: "Refine Context", description: "Denoise transcript and segment into logical chunks", icon: Edit3, hidden: true },
    { id: "cluster", label: "Analysis Cluster", description: "Unified high-performance analysis (Refine, Summary, Insights)", icon: Sparkles, apiEndpoint: "/api/pipeline/cluster", apiBody: (sid) => ({ source_id: sid }), hidden: true },
    { id: "summary", label: "Source Summary", description: "Concise summary and key framework identification", icon: FileText, hidden: true },
    { id: "packet", label: "Density Mapping", description: "Identify high-signal segments for extraction", icon: Target, hidden: true },
    { id: "insights", label: "Extract Intelligence", description: "Thesis extraction, frameworks, and strategic takeaways", icon: Sparkles },
    { id: "angle", label: "Editorial Strategy", description: "Select framing, audience, and narrative angle", icon: Target, apiEndpoint: "/api/angles/strategize", apiBody: (sid, params) => ({ transcriptId: sid, type: params?.type, audience: params?.audience, tone: params?.tone }) },
    { id: "draft", label: "Generate Draft", description: "Full editorial content creation via LLM swarm", icon: Edit3, apiEndpoint: "/api/drafts/generate", apiBody: (sid, params) => ({ transcriptId: sid, type: params?.type, audience: params?.audience, tone: params?.tone }) },
    { id: "qa", label: "Analyze Matrix", description: "Score publishability and strategic alignment matrix", icon: ShieldCheck, apiEndpoint: "/api/drafts/evaluate", apiBody: (sid) => ({ sourceId: sid }) },
    { id: "socialise", label: "Social content", description: "Generate X threads, LinkedIn posts, and distribution assets", icon: Share2, apiEndpoint: "/api/socialise", apiBody: (sid) => ({ transcriptId: sid }) },
];

const INTENT_DESCRIPTIONS: Record<string, string> = {
    blog_article: "Long-form editorial piece with structured arguments and narrative flow.",
    social_thread: "X-style thread optimized for engagement and viral potential.",
    whitepaper: "Technical deep-dive with formal tone and comprehensive data evidence.",
    newsletter_segment: "Curated update for high-signal technical newsletters.",
    executive_brief: "Concise summary focusing on bottom-line impact and strategic value."
}

const validateStageGating = (stageId: StageId, results: Record<string, unknown>): { valid: boolean; missing?: string; type?: "error" | "info" } => {
    switch (stageId) {
        case "refine": 
            if (!results.transcript) return { valid: false, missing: "Transcript", type: "error" };
            break;
        case "summary": {
            const clusterS = (results.cluster as { status?: string } | undefined)?.status
            if (results.summary || clusterS === "success" || clusterS === "success_fallback") return { valid: true };
            if (results.transcriptStatus === 'unavailable' || results.transcriptStatus === 'rescued_text') return { valid: true };
            if (!results.refine && !results.transcript) return { valid: false, missing: "Summary/Refinement", type: "error" };
            break;
        }
        case "insights": {
            const clusterI = (results.cluster as { status?: string } | undefined)?.status
            if (results.insights || clusterI === "success" || clusterI === "success_fallback") return { valid: true };
            if (results.transcriptStatus === 'unavailable' || results.transcriptStatus === 'rescued_text') return { valid: true };
            if (!results.summary && !results.refine) return { valid: false, missing: "Summary/Refinement", type: "error" };
            break;
        }
        case "angle":
            if (!results.insights) return { valid: false, missing: "Insights", type: "error" };
            break;
        case "draft":
            if (!results.angle || !results.insights) {
                return { 
                    valid: false, 
                    missing: "Editorial Strategy/Insights", 
                    type: results.insights && !results.angle ? "info" : "error" 
                };
            }
            break;
        case "qa":
            if (!results.draft && !results.WrittenDraft) return { valid: false, missing: "Draft Content", type: "error" };
            break;
        case "socialise":
            if (!results.draft && !results.WrittenDraft) return { valid: false, missing: "Draft Content", type: "error" };
            break;
    }
    return { valid: true };
};

export default function SourceMissionControlWrapper() {
    return (
        <Suspense fallback={<MissionControlSkeleton />}>
            <SourceMissionControlContent />
        </Suspense>
    )
}

function SourceMissionControlContent() {
    const { t, lang } = useLanguage()
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const autoRunSignal = searchParams?.get("run") === "true"
    const id = (params?.id as string) || "unknown"
    const [source, setSource] = useState<SourceCandidate>({
        id: id,
        title: "...",
        channel: "...",
        url: "#",
        published: "—",
        duration: "—",
        status: "idle",
        score: 0,
        transcriptStatus: "pending",
        createdAt: new Date().toISOString(),
        completedStages: []
    })

    // Stage results stored by ID
    const [stageResults, setStageResults] = useState<Record<string, StageResultData>>({})

    // Sync score & duration from results to source header
    useEffect(() => {
        // 1. Sync Score
        if (stageResults.qa) {
            const qa = stageResults.qa as Record<string, unknown>
            const dqmPayload = (qa.payload || qa.data || qa.result || qa) as Record<string, unknown>;
            const scores = (dqmPayload?.scores || dqmPayload) as Record<string, number | undefined>;
            const score = scores?.publishability || scores?.total_score || scores?.score || scores?.dqmScore;
            if (score !== undefined && score !== source.score) {
                setSource(s => ({ ...s, score: Number(score) }));
            }
        }
        
        // 2. Sync Duration
        if (stageResults.transcript) {
            const ts = stageResults.transcript as TranscriptResult
            const tsRaw = ts as unknown as Record<string, Record<string, unknown>>;
            const rawDuration = ts.duration || tsRaw?.result?.duration || tsRaw?.metadata?.duration;
            if (typeof rawDuration === 'number') {
                const formatted = formatDuration(rawDuration);
                if (formatted !== source.duration) {
                    setSource(s => ({ ...s, duration: formatted }));
                }
            }
        }
    }, [stageResults.qa, stageResults.transcript, source.score, source.duration])

    // Invalidate strategy/draft when intent changes
    const invalidateStrategy = () => {
        setCompletedStages(prev => {
            const next = new Set(prev)
            next.delete("angle")
            next.delete("draft")
            next.delete("qa")
            return next
        })
    }

    // Track which stages are completed
    const [completedStages, setCompletedStages] = useState<Set<StageId>>(new Set())

    // Hydration fix for completedStages — Listen to the Source-of-Truth from Prisma
    useEffect(() => {
        if (!source || !source.completedStages) return
        
        const initial = new Set<StageId>()
        
        // Sync from the database record
        if (Array.isArray(source.completedStages)) {
            source.completedStages.forEach(s => {
                initial.add(s as StageId)
            })
        }

        // Maintain logic for inferred internal status (Judge/Transcript)
        if ((source.score ?? 0) > 0) initial.add("judge")
        if (source.transcriptStatus === "transcribed" || source.transcriptStatus === "rescued_text") {
            initial.add("transcript")
        }
        
        setCompletedStages(initial)
    }, [source.completedStages, source.score, source.transcriptStatus])



    // Currently executing stage
    const [executingStage, setExecutingStage] = useState<StageId | null>(null)
    const executingStageRef = useRef<StageId | null>(null)
    useEffect(() => { executingStageRef.current = executingStage }, [executingStage])
    const [isRunningAll, setIsRunningAll] = useState(false)
    // Synchronous ref so runFullPipeline can prevent double-execution even
    // before React re-renders with the new isRunningAll=true value.
    const isRunningAllRef = useRef(false)
    const [showCelebration, setShowCelebration] = useState(false)
    const [error, setError] = useState<{ message: string; type: "error" | "info" } | null>(null)

    // Side panel state
    const [panelContent, setPanelContent] = useState<{ title: string; stageId: StageId; data: unknown } | null>(null)

    // Writing Intent states
    const [intentType, setIntentType] = useState<string>("blog_article")
    const [intentAudience, setIntentAudience] = useState<string>("general")
    const [intentTone, setIntentTone] = useState<string>("professional")
    const [autoStart, setAutoStart] = useState<boolean>(false)

    // Expanded accordion IDs
    const [isExportOpen, setIsExportOpen] = useState(false)


    // Processing logs
    const [logs, setLogs] = useState<{ event: string; time: string; status: "success" | "info" | "error" }[]>([])

    // ════ HELPER FUNCTIONS ════
    // Using centralized formatDuration from @/lib/utils

    // Determine the absolute next stage for the pipeline loop (including hidden)
    const getFirstIncompleteIndex = useCallback((): number => {
        const tStatus = source.transcriptStatus
        const isTranscriptDone = tStatus === "transcribed" || tStatus === "rescued_text" || tStatus === "unavailable"
        
        for (let i = 0; i < STAGES.length; i++) {
            const s = STAGES[i]
            // Skip hidden stages that are effectively background tasks or already satisfying dependencies
            if (s.id === "judge" && completedStages.has("judge")) continue
            if (s.id === "transcript" && (isTranscriptDone || completedStages.has("transcript"))) continue
            if (s.id === "summary" && (completedStages.has("summary") || completedStages.has("cluster"))) continue
            if (s.id === "packet" && (completedStages.has("packet") || completedStages.has("cluster"))) continue
            
            if (!completedStages.has(s.id)) return i

            // IMPORTANT FIX: Even if stage is marked completed in DB, if it fails gating 
            // (e.g. missing dependencies), we MUST stop at it!
            const gate = validateStageGating(s.id, stageResults);
            if (!gate.valid) return i;

            // ENFORCE LOCAL DATA for interactive/critical stages.
            // If the DB says 'angle' is completed but we have no local results for it,
            // we must not skip it. We must stop to allow regeneration.
            if (s.id === "angle" && !stageResults.angle) return i;
            if (s.id === "draft" && !stageResults.draft && !stageResults.WrittenDraft) return i;
        }
        return STAGES.length
    }, [completedStages, source.transcriptStatus, source.id, stageResults]);

    const persistStageCompletion = useCallback(async (stageId: StageId) => {
        try {
            await fetch("/api/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "complete_stage", sourceId: id, stageId })
            })
        } catch (e) {
            console.error(`Failed to persist completion for ${stageId}:`, e)
        }
    }, [id]);

    // ════ REAL-TIME SYNC ════
    useEffect(() => {
        if (!id || !supabase || typeof supabase.channel !== 'function') return;

        const channel = supabase
            .channel(`source_changes_${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'Source',
                    filter: `id=eq.${id}`,
                },
                (payload: { new: SourceCandidate }) => {
                    // Sync Metadata
                    setSource(prev => {
                        if (!prev || !payload.new) return prev;
                        const next = { ...prev, ...payload.new };
                        // Ensure numeric duration is formatted
                        if (typeof payload.new.duration === 'number') {
                            next.duration = formatDuration(payload.new.duration);
                        }
                        return next;
                    });

                    // Sync Completed Stages & Clearing Execution State
                    const stagesFromPayload = payload.new.completedStages;
                    if (stagesFromPayload && Array.isArray(stagesFromPayload)) {
                        const newCompleted = new Set(stagesFromPayload as StageId[]);
                        
                        setCompletedStages(prev => {
                            // ALWAYS merge — never replace. The DB payload may not include
                            // judge/transcript (inferred stages never pushed to Prisma).
                            // Replacing would clobber them and break stage circle display.
                            return new Set([...Array.from(prev), ...Array.from(newCompleted)]);
                        });
                        
                        if (executingStageRef.current && newCompleted.has(executingStageRef.current)) {
                             setExecutingStage(null);
                        }
                    }

                    // Handle Finish Signal
                    if (payload.new.status === 'done') {
                        setIsRunningAll(false);
                        setExecutingStage(null);
                        setLogs(prev => {
                            if (prev.some(l => l.event === "SUCCESS: Pipeline completed in background")) return prev;
                            return [{ event: "SUCCESS: Pipeline completed in background", time: "Just now", status: "success" }, ...prev];
                        });
                        setShowCelebration(true);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id]);

    // ════ DATA FETCHING ════

    const runFullPipeline = useCallback(async (resuming = false) => {
        // HARD GUARD: Use a ref (not state) to prevent double-execution.
        // React state is async; a second call can slip through before the first
        // render cycle completes with isRunningAll=true.
        if (isRunningAllRef.current) {
            console.warn("[Pipeline] runFullPipeline called while already running. Ignoring.")
            return
        }
        isRunningAllRef.current = true
        setIsRunningAll(true)
        setError(null)
        setLogs([])  // Clear logs for fresh run — each "Continue Pipeline" starts clean

        // RACE CONDITION FIX: completedStages React state may not be hydrated yet
        // when autostart fires. Read from the `source` object (Prisma data — already loaded
        // on page mount via the Server Component) which is always authoritative.
        // This avoids an extra network round-trip and the local-store 404 problem.
        const authorativeCompleted = new Set(completedStages)
        
        // Merge in DB completedStages from Prisma source object (already in React state)
        if (source?.completedStages && Array.isArray(source.completedStages)) {
            source.completedStages.forEach((s: string) => authorativeCompleted.add(s as StageId))
        }
        // Infer hidden stages from metadata fields
        if ((source?.score ?? 0) > 0) authorativeCompleted.add("judge")
        if (
            source?.transcriptStatus === "transcribed" ||
            source?.transcriptStatus === "rescued_text" ||
            source?.transcriptStatus === "unavailable"  // DRM-restricted: treated as done
        ) {
            authorativeCompleted.add("transcript")
        }
        // Sync to React state so UI reflects reality before we start looping
        setCompletedStages(new Set(authorativeCompleted))

        const currentCompleted = authorativeCompleted
        const currentResults: Record<string, StageResultData> = { ...stageResults }; 
        const startIndex = getFirstIncompleteIndex()

        for (let i = startIndex === STAGES.length ? 0 : startIndex; i < STAGES.length; i++) {
            const stage = STAGES[i]

            // ENFORCE LOCAL DATA for loop progression
            let hasData = true;
            if (stage.id === "angle" && !currentResults.angle) hasData = false;
            if (stage.id === "draft" && !currentResults.draft && !currentResults.WrittenDraft) hasData = false;

            if (currentCompleted.has(stage.id)) {
                // Verify all upstream dependencies are still met, AND the data is locally present
                const gate = validateStageGating(stage.id, currentResults);
                if (gate.valid && hasData) continue;
            }

            // ─── CLUSTER OPTIMIZATION ───
            if ((stage.id === "cluster" || stage.id === "refine" || stage.id === "summary" || stage.id === "insights") && 
                !currentCompleted.has("cluster")) {
                
                setExecutingStage("cluster");
                setLogs(prev => [{ event: "Initiating Unified Analysis Cluster...", time: "Just now", status: "info" }, ...prev]);
                
                try {
                    const clusterRes = await fetch("/api/pipeline/cluster", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ source_id: id, language: lang })
                    });
                    
                    if (!clusterRes.ok) {
                        let errorMsg = "Analysis Cluster execution failed";
                        try {
                            const clusterDataErr = await clusterRes.json();
                            if (clusterDataErr.error) {
                                errorMsg = clusterDataErr.error;
                            }
                        } catch { }
                        throw new Error(errorMsg);
                    }
                    const clusterData = await clusterRes.json();
                    // API returns: { status: "success", result: { refine, summary, packet, insights }, metadata: {...} }
                    // The outer `status` field tells us success/failure.
                    // The inner `result` IS the results dict — no sub-status field on it.
                    const clusterStatus = clusterData.status;  // "success" | "success_fallback" | "rescued"
                    const results = clusterData.result;        // { refine, summary, packet, insights }
                    const meta = clusterData?.metadata || results?.metadata;
                    if (meta) {
                        setSource(prev => {
                            if (!prev) return prev;
                            return {
                                ...prev,
                                title: meta.title && meta.title !== 'Podcast Episode' ? meta.title : prev.title,
                                duration: formatDuration(meta.duration) || prev.duration,
                                channel: meta.channel || prev.channel,
                                transcriptStatus: "transcribed"
                            };
                        });
                    }

                    const updateObj: Record<string, StageResultData> = { ...currentResults };
                    
                    // HONEST HANDSHAKE: Only mark completed if the outer API status is success.
                    // clusterData.status = "success" | "success_fallback" — do NOT read results.status
                    // because the inner results dict has no .status field.
                    if (clusterStatus === "success" || clusterStatus === "success_fallback") {
                        if (results.refine) { updateObj.refine = results.refine; currentResults.refine = results.refine; currentCompleted.add("refine"); }
                        if (results.summary) { updateObj.summary = results.summary; currentResults.summary = results.summary; currentCompleted.add("summary"); }
                        if (results.packet) { updateObj.packet = results.packet; currentResults.packet = results.packet; currentCompleted.add("packet"); }
                        if (results.insights) { updateObj.insights = results.insights; currentResults.insights = results.insights; currentCompleted.add("insights"); }
                        
                        currentCompleted.add("cluster");
                        
                        setStageResults(prev => ({ ...prev, ...updateObj }));
                        setCompletedStages(new Set(currentCompleted));
                        
                        await persistStageCompletion("cluster");

                        setLogs(prev => [{ event: "Analysis Cluster completed (Refine, Summary, Insights)", time: "Just now", status: "success" }, ...prev]);
                        
                        const angleIndex = STAGES.findIndex(s => s.id === "angle");
                        i = angleIndex - 1; 
                        setExecutingStage(null);
                        continue; 
                    } else {
                        // IT FAILED OR PAUSED IN BACKEND
                        const failMsg = clusterData.error || results?.error_detail || "Analysis Paused: Insufficient source context";
                        setError({ message: failMsg, type: "error" });
                        setLogs(prev => [{ event: failMsg, time: "Just now", status: "error" }, ...prev]);
                        isRunningAllRef.current = false
                        setIsRunningAll(false);
                        setExecutingStage(null);
                        break;
                    }
                    
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Unknown error'
                    setError({ message: msg, type: "error" });
                    isRunningAllRef.current = false
                    setIsRunningAll(false);
                    setExecutingStage(null);
                    break;
                }
            }

            // ─── PARALLELIZATION OPTIMIZATION ───
            if (stage.id === "qa" && currentCompleted.has("draft")) {
                setExecutingStage("qa");
                setLogs(prev => [{ event: "Launching Parallel Verification & Socialisation...", time: "Just now", status: "info" }, ...prev]);
                
                try {
                    const qaStage = STAGES.find(s => s.id === "qa")!;
                    const socialiseStage = STAGES.find(s => s.id === "socialise")!;
                    
                    // Stagger the calls slightly to prevent literal simultaneous DB connections
                    const qaPromise = fetch(qaStage.apiEndpoint!, { 
                        method: "POST", 
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...qaStage.apiBody!(id), language: lang })
                    });

                    const socialPromise = new Promise(r => setTimeout(r, 250)).then(() => 
                        fetch(socialiseStage.apiEndpoint!, { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...socialiseStage.apiBody!(id), language: lang })
                        })
                    );
                    
                    const [qaRes, socialRes] = await Promise.all([qaPromise, socialPromise]);
                    
                    if (!qaRes.ok || !socialRes.ok) {
                        // Even if one failed, try to update the one that succeeded to fix the "View" button state
                        if (qaRes.ok) {
                            const qaData = await qaRes.json();
                            const qaValue = (qaData.result || qaData) as StageResultData;
                            setStageResults(prev => ({ ...prev, qa: qaValue }));
                            setCompletedStages(prev => new Set([...prev, "qa"]));
                            currentCompleted.add("qa");
                        }
                        
                        const qaError = !qaRes.ok ? await qaRes.text() : "";
                        const socialError = !socialRes.ok ? await socialRes.text() : "";
                        throw new Error(`Parallel execution failed: ${qaError || socialError || "One or more stages failed"}`);
                    }

                    const qaData = await qaRes.json();
                    const socialData = await socialRes.json();
                    
                    const qaValue = (qaData.result || qaData) as StageResultData;
                    const socialValue = (socialData.result || socialData) as StageResultData;
                    
                    setStageResults(prev => ({ ...prev, qa: qaValue, socialise: socialValue }));
                    setCompletedStages(prev => new Set([...prev, "qa", "socialise"]));
                    currentCompleted.add("qa");
                    currentCompleted.add("socialise");
                    
                    // Persist parallel stages to DB
                    await Promise.all([
                        persistStageCompletion("qa"),
                        persistStageCompletion("socialise")
                    ]);

                    setLogs(prev => [{ event: "Parallel verification and assets completed", time: "Just now", status: "success" }, ...prev]);
                    
                    const qaResult = qaValue as Record<string, unknown>;
                    if (qaResult && typeof qaResult.total_score === 'number') {
                        setSource(s => ({ ...s, score: qaResult.total_score as number, status: "done" }));
                    }
                    
                    i = STAGES.length; 
                    setExecutingStage(null);
                    setShowCelebration(true);
                    break;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Unknown error'
                    setError({ message: msg, type: "error" });
                    isRunningAllRef.current = false
                    setIsRunningAll(false);
                    setExecutingStage(null);
                    break;
                }
            }

            const gate = validateStageGating(stage.id, currentResults)
            if (!gate.valid) {
                if (gate.type === "info") {
                    setLogs(prev => [{ event: `Pipeline paused for review. Please check insights and configure Framing/Intent.`, time: "Just now", status: "info" }, ...prev])
                    setError({ message: `Pipeline waiting for Editorial Strategy. Please confirm your intent options below.`, type: "info" })
                } else {
                    setLogs(prev => [{ event: `Pipeline halted: ${stage.label} is missing ${gate.missing}`, time: "Just now", status: "info" }, ...prev])
                    setError({ message: `Pipeline stopped at ${stage.label} due to missing ${gate.missing}`, type: "info" })
                }
                isRunningAllRef.current = false
                setIsRunningAll(false)
                break
            }
            
            if (id.startsWith("local-")) {
                await new Promise(r => setTimeout(r, 100))
                
                const isAudio = id.toLowerCase().includes("mp3") || id.toLowerCase().includes("wav") || id.toLowerCase().includes("m4a") || id.toLowerCase().includes("audio");
                
                let mockData: Record<string, unknown> = { status: "success" }
                if (stage.id === "judge") mockData = { result: { title: source?.title || "Local Import", channel: isAudio ? "Local Audio" : "Local Video", url: "file://local", score: 8 } }
                if (stage.id === "transcript") mockData = { result: { segments: [{ start: 0, text: isAudio ? "Mock transcript for audio meeting..." : "Transcript for local media..." }] } }
                if (stage.id === "refine") mockData = { result: { segments: [{ text: "Refined local transcript..." }] } }
                if (stage.id === "insights") mockData = { result: { core_argument: "Local data insights.", key_claims: ["Analysis ready"], memorable_quotes: ["Direct from source."] } }
                if (stage.id === "angle") mockData = { result: { recommended_format: "Article", framing_angle: "Local focus", working_titles: ["The Local Edge"] } }
                if (stage.id === "draft") mockData = { result: { title: "Draft from Local", content: "# Local Draft\n\nGenerated for local media." } }
                if (stage.id === "qa") mockData = { 
                    result: { 
                        total_score: 82, 
                        decision: "Publish Ready", 
                        scores: { publishability: 82, seo: 85, aeo: 75 },
                        dimensions: { density: 8, depth: 8, utility: 8 },
                        rationale: "Good local baseline." 
                    } 
                }

                const data = mockData as Record<string, unknown>
                const resValue = (data.result || data) as StageResultData
                setStageResults(prev => ({ ...prev, [stage.id]: resValue }))
                currentResults[stage.id] = resValue
                setCompletedStages(prev => new Set([...prev, stage.id]))
                currentCompleted.add(stage.id)
                
                if (typeof window !== 'undefined') {
                    const localKey = `distill_results_${id}`;
                    const existing = JSON.parse(localStorage.getItem(localKey) || "{}");
                    localStorage.setItem(localKey, JSON.stringify({ ...existing, [stage.id]: resValue }));
                }
                
                if (stage.id === "qa") {
                    const resObj = (data as StagePayload).result || data;
                    if (resObj && ((resObj as QAResult).total_score !== undefined || (resObj as QAResult).scores)) {
                        const scoreValue = (resObj as QAResult).total_score ?? (resObj as QAResult).scores?.publishability;
                        setSource(s => ({ ...s!, score: scoreValue }));
                    }
                }

                setLogs(prev => [{ event: `${stage.label} (Local Mode) completed`, time: "Just now", status: "success" }, ...prev])
                continue
            }

            if (!stage.apiEndpoint || !stage.apiBody) {
                // CLUSTER-BUNDLED STAGES: These stages are handled internally by the Analysis Cluster.
                // Skip them completely and silently -- no state mutation, no log entry.
                // Marking them "completed" here would corrupt the gating logic.
                const CLUSTER_BUNDLED: StageId[] = ["refine", "summary", "packet"]
                if (CLUSTER_BUNDLED.includes(stage.id)) {
                    continue
                }
                // For any other unimplemented stage, log it visibly
                setLogs(prev => [{ event: `${stage.label} skipped (not implemented)`, time: "Just now", status: "info" }, ...prev])
                continue
            }


            // Clear previous info/error state before starting a new stage
            setError(null)

            if (i !== startIndex) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            if (stage.id === "angle" && !resuming) {
                setIsRunningAll(false)
                setExecutingStage(null)
                setLogs(prev => [{ event: `Pipeline paused. Select your Writing Intent Strategy below, then click Continue.`, time: "Just now", status: "info" }, ...prev])
                setError({ message: "Select your writing intent strategy below, then click Continue Pipeline.", type: "info" })
                break
            }

            setExecutingStage(stage.id)

            try {
                const basePayload = (stage.id === "draft" || stage.id === "angle")
                    ? { 
                        ...stage.apiBody(id, { type: intentType, audience: intentAudience, tone: intentTone }), 
                        transcriptId: id,
                        stream: stage.id === "draft",
                      }
                    : stage.apiBody(id)
                
                const bodyPayload = { ...basePayload, language: lang }

                const res = await fetch(stage.apiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bodyPayload)
                })

                let data: StagePayload | null = null;
                if ((stage.id === "draft" || stage.id === "insights") && res.body) {
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let fullContent = "";
                    let buffer = "";

                    let shouldAbortStream = false;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done || shouldAbortStream) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const parsed = JSON.parse(line);
                                if (parsed.type === "status") {
                                    setLogs(prev => [{ event: parsed.text, time: "Just now", status: "info" as const }, ...prev]);
                                } else if (parsed.type === "chunk" && (parsed as StreamChunk).text) {
                                    fullContent += (parsed as StreamChunk).text as string;
                                    const wordCount = fullContent.trim().split(/\s+/).filter(Boolean).length;
                                    setStageResults(prev => {
                                        const updated = { 
                                            ...prev, 
                                            [stage.id]: { 
                                                result: { 
                                                    content: fullContent, 
                                                    title: "Generating Draft...",
                                                    word_count: wordCount
                                                } 
                                            } 
                                        };
                                        if (panelContent && panelContent.stageId === stage.id) {
                                            setPanelContent({
                                                ...panelContent,
                                                data: updated[stage.id]
                                            });
                                        }
                                        return updated;
                                    });
                                } else if (parsed.type === "error") {
                                    // CRITICAL: Stop the stream on explicit error payload
                                    console.error("Streaming error chunk received:", parsed.message);
                                    setLogs(prev => [{ event: `ERROR: ${parsed.message}`, time: "Just now", status: "error" }, ...prev]);
                                    data = { status: "error", error: parsed.message } as unknown as StagePayload;
                                    shouldAbortStream = true; 
                                    break; 
                                } else if (parsed.type === "success" || parsed.status === "success" || (parsed as StagePayload).data || parsed.result) {
                                    data = parsed as StagePayload;
                                    // If we got a final success result in the stream, we can stop reading
                                    if (data.result || data.data) break;
                                }
                            } catch (e) {
                                console.error("Error parsing stream chunk:", e, line);
                            }
                        }
                    }
                    if (!data && fullContent) {
                        data = { status: "success", result: { content: fullContent } } as StagePayload;
                    }
                    
                    // Force state update for finished streaming draft to ensure "View" button appears
                    if (stage.id === "draft" && fullContent) {
                        const finalResult = { result: { content: fullContent, word_count: fullContent.trim().split(/\s+/).filter(Boolean).length } };
                        setStageResults(prev => ({ ...prev, draft: finalResult }));
                        currentResults["draft"] = finalResult; // Sync local object for next loop iteration
                        currentCompleted.add("draft");
                    }
                } else {
                    data = await res.json()
                    if (!res.ok) throw new Error(data?.error || "Execution failed")
                }

                const resValue = (data?.result || data) as StageResultData
                if (resValue) {
                    setStageResults(prev => {
                        const next = { ...prev, [stage.id]: resValue }
                        if (stage.id === "cluster" && typeof resValue === "object") {
                            const cr = resValue as Record<string, unknown>
                            if (cr.summary) next.summary = cr.summary as StageResultData
                            if (cr.packet) next.packet = cr.packet as StageResultData
                            if (cr.insights) next.insights = cr.insights as StageResultData
                        }
                        return next
                    })
                    currentResults[stage.id] = resValue 
                    if (stage.id === "cluster" && typeof resValue === "object") {
                        const cr = resValue as Record<string, unknown>
                        if (cr.summary) currentResults.summary = cr.summary as StageResultData
                        if (cr.packet) currentResults.packet = cr.packet as StageResultData
                        if (cr.insights) currentResults.insights = cr.insights as StageResultData
                    }

                    if (stage.id === "transcript") {
                        const tsData = (resValue as TranscriptResult);
                        const segments = tsData?.segments || (resValue as { result?: { segments?: unknown[] } })?.result?.segments;
                        const status = (resValue as {status?: string}).status || (resValue as {result?: {status?: string}}).result?.status;
                        
                        // Relaxed Gating: If no segments, warn but DO NOT halt
                        if ((!segments || segments.length === 0) && status !== 'rescued_text' && status !== 'unavailable') {
                            const errorMsg = "Note: Full audio transcript unavailable. Proceeding with show notes/metadata.";
                            setLogs(prev => [{ event: errorMsg, time: "Just now", status: "info" }, ...prev]);
                        }
                        
                        // Show high-fidelity context banner if metadata-only
                        if (status === 'rescued_text') {
                            setLogs(prev => [{ 
                                event: "Audio restricted; proceeding with Official Source Context Intelligence.", 
                                time: "Just now", 
                                status: "info" 
                            }, ...prev]);
                            setError({ 
                                message: "Audio restricted by platform. Distill is analyzing the Official Source Context to generate intelligence.", 
                                type: "info" 
                            });
                        }
                    }

                    if (panelContent && panelContent.stageId === stage.id) {
                        setPanelContent({
                            ...panelContent,
                            data: resValue
                        });
                    }
                }

                setCompletedStages(prev => {
                    const next = new Set(prev)
                    next.add(stage.id as StageId)
                    if (stage.id === "cluster") {
                        next.add("refine")
                        next.add("summary")
                        next.add("packet")
                        next.add("insights")
                    }
                    return next
                })

                setLogs(prev => [{ 
                    event: `${stage.label} completed`, 
                    time: "Just now", 
                    status: "success" 
                }, ...prev])

                currentCompleted.add(stage.id)
                if (stage.id === "cluster") {
                    currentCompleted.add("refine")
                    currentCompleted.add("summary")
                    currentCompleted.add("packet")
                    currentCompleted.add("insights")
                }

                // Truth sync: ensure Draft is marked as a completed result for gating
                if (stage.id === "draft" && data) {
                    currentResults["draft"] = (data.result || data) as StageResultData;
                }

                if (stage.id === "qa" && data && typeof data === 'object') {
                    const resObj = (data as StagePayload).result || data;
                    const dqmPayload = (resObj as QAResult);
                    const scoreValue = dqmPayload?.scores?.publishability || dqmPayload?.total_score;
                    
                    if (scoreValue !== undefined) {
                        setSource(s => ({
                            ...s,
                            score: scoreValue,
                            status: scoreValue >= 80 ? "done" : "failed",
                        }))
                        if (typeof window !== 'undefined') {
                            localStorage.setItem(`dqm_${id}`, JSON.stringify(dqmPayload))
                        }
                    }
                }
                
                if (data && data.result) {
                    if (stage.id === "judge") {
                        const judgeData = (data as StagePayload).result as JudgeResult || data;
                        const updatedSource = {
                            title: judgeData?.title || source?.title,
                            channel: judgeData?.channel || source?.channel,
                            url: judgeData?.url || source?.url,
                        }
                        setSource(s => ({
                            ...s,
                            ...updatedSource
                        }))
                        // Surface language warning as a persistent amber banner
                        if (judgeData.language_warning) {
                            setError({ message: judgeData.language_warning, type: "info" })
                            setLogs(prev => [{ event: `⚠️ Language detected: ${judgeData.detected_language?.toUpperCase()} — ${judgeData.language_warning}`, time: "Just now", status: "info" }, ...prev])
                        }
                        try {
                            await fetch("/api/store", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ 
                                    action: "upsert", 
                                    source: { id, ...updatedSource } 
                                })
                            })
                        } catch { /* silently fail */ }
                    }
                    if (stage.id === "transcript") {
                        const d = data as StagePayload;
                        const duration = d.duration || (d.result as TranscriptResult)?.duration;
                        if (duration) {
                            setSource(s => s ? ({ ...s, duration: formatDuration(duration) }) : s);
                        }
                    }
                }

                setLogs(prev => [{ event: `${stage.label} completed`, time: "Just now", status: "success" }, ...prev])

                try {
                    await fetch("/api/store", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "complete_stage", sourceId: id, stageId: stage.id })
                    })
                } catch { /* silently fail */ }

            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Unknown error"
                setError({ message: msg, type: "error" })
                setLogs(prev => [{ event: `Pipeline stopped: ${stage.label} failed — ${msg}`, time: "Just now", status: "error" }, ...prev])
                isRunningAllRef.current = false
                setIsRunningAll(false)
                break 
            } finally {
                setExecutingStage(null)
            }
        }

        isRunningAllRef.current = false
        setIsRunningAll(false)
        setExecutingStage(null)
        
        if (currentCompleted.has("socialise")) {
            setLogs(prev => [{ event: "Full pipeline completed successfully", time: "Just now", status: "success" }, ...prev])
        }

        try {
            const res = await fetch("/api/store")
            if (res.ok) {
                const data = await res.json()
                const refreshed = (data.sources || []).find((s: Record<string, unknown>) => s.id === id)
                if (refreshed) {
                    setSource(s => (s && refreshed) ? { ...s, ...refreshed } : (s || refreshed))
                    
                    if (refreshed?.completedStages?.includes("socialise")) {
                        const resApi = await fetch(`/api/sources/${id}/results`);
                        const resultData = await resApi.json();
                        if (resultData?.results) {
                            // MERGE — never replace. In-memory stageResults from the
                            // just-completed run (angle, draft, qa, socialise) must survive.
                            setStageResults(prev => ({ ...prev, ...resultData.results }));
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Failed final metadata refresh:", e)
        }
    }, [completedStages, getFirstIncompleteIndex, id, intentAudience, intentTone, intentType, panelContent, source?.channel, source?.title, source?.url, source?.completedStages, source?.transcriptStatus, source?.score, stageResults, persistStageCompletion, lang]);

    // Load persisted state on mount
    useEffect(() => {
        async function fetchPrefs() {
            try {
                const res = await fetch("/api/user/preferences")
                if (res.ok) {
                    const data = await res.json()
                    setAutoStart(!!data.autoStartPipeline)
                }
            } catch { /* fail silent */ }
        }
        fetchPrefs()
        
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
                    const stored = (data.sources || []).find((s: Record<string, unknown>) => s.id === id)
                    if (stored) {
                        // Always restore source metadata from store
                        setSource(s => ({
                            ...s,
                            ...stored,
                            transcriptStatus: stored.transcript_status || stored.transcriptStatus || s.transcriptStatus,
                        }))
                        if (stored.completedStages && stored.completedStages.length > 0) {
                            setCompletedStages(new Set(stored.completedStages))
                        }
                    }
                }

                // Load actual stage result data from disk
                const res = await fetch(`/api/sources/${id}/results`);
                const data = await res.json();
                
                // STABILITY: Calculate merged result set once to ensure atomic Truth Audit
                const loadedResults = await new Promise<Record<string, StageResultData>>(resolve => {
                    setStageResults(prev => {
                        const merged = { ...prev, ...(data?.results || {}) };
                        resolve(merged as Record<string, StageResultData>);
                        return merged;
                    });
                });

                // ════ TRUTH AUDIT ════
                // If a stage is marked completed in DB but has no artifact on disk AND we haven't seen it,
                // remove it from the local completion set to allow a re-run.
                setCompletedStages(prev => {
                    const validated = new Set(Array.from(prev))
                    const criticalArtifactStages: StageId[] = ["transcript", "summary", "insights", "angle", "draft", "qa", "socialise"]
                    
                    criticalArtifactStages.forEach(sid => {
                        // We check the computed merged results
                        const hasArtifact = loadedResults[sid];

                        if (hasArtifact) {
                            // Force topological validation to prevent ghost completions from stale disk artifacts
                            const gate = validateStageGating(sid, loadedResults);
                            if (gate.valid) {
                                validated.add(sid) 
                            } else if (!isRunningAll) {
                                validated.delete(sid) 
                            }
                        } else if (prev.has(sid) && !isRunningAll) {
                            // Only delete if NOT running AND we are absolutely sure it's missing
                            validated.delete(sid) 
                        }
                    })


                        
                        // If socialise is done, ensure the whole pipeline is effectively closed
                        if (validated.has("socialise")) {
                            ["refine", "cluster", "packet"].forEach(sid => validated.add(sid as StageId));
                        }
                        
                        return validated
                    })

                // Caching enhancement: try loading from localStorage first for immediate UI

                const cachedDqm = typeof window !== 'undefined' ? localStorage.getItem(`dqm_${id}`) : null
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


    // Determine the stage currently interactive in the UI (visible only)
    const getActiveVisibleIndex = (): number => {
        const index = STAGES.findIndex(s => !s.hidden && !completedStages.has(s.id))
        return index === -1 ? STAGES.length : index
    }

    const activeIndex = getFirstIncompleteIndex()
    const activeVisibleIndex = getActiveVisibleIndex()

    const getStageStatus = (index: number): StageStatus => {
        const stage = STAGES[index]
        const tStatus = source?.transcriptStatus
        
        if (completedStages.has(stage.id)) {
            // Visual Gate: Only show completed if dependencies are met AND stage data exists
            const gate = validateStageGating(stage.id, stageResults);
            
            let hasData = true;
            if (stage.id === "angle" && !stageResults.angle) hasData = false;
            if (stage.id === "draft" && !stageResults.draft && !stageResults.WrittenDraft) hasData = false;

            if (gate.valid && hasData) return "completed";
        }
        
        // Ensure transcript stage shows as completed if status is retrieved
        if (stage.id === "transcript" && (tStatus === "transcribed" || tStatus === "rescued_text" || tStatus === "unavailable")) return "completed"
        
        // Logical Gate: Summary becomes active when transcript is done
        if (stage.id === "summary" && (completedStages.has("transcript") || tStatus === "transcribed" || tStatus === "rescued_text")) {
             if (!completedStages.has("summary")) return "active";
        }

        // Force angle to be active if insights/cluster are done
        if (stage.id === "angle" && (completedStages.has("insights") || !!stageResults.insights || !!stageResults.cluster)) return "active"
        
        // A stage is active if it's the next visible thing to do
        if (index === activeVisibleIndex) return "active"
        
        // If it's a hidden stage but it's the absolute next step, it's also effectively "active" (processing)
        if (index === activeIndex && stage.hidden) return "active"

        return "locked"
    }

    // Auto-start Harvesting Automation
    // IMPORTANT: hasAutoStartedRef prevents double-firing when activeIndex changes
    // between stages (which previously caused judge + transcript to run twice).
    const hasAutoStartedRef = useRef(false)
    useEffect(() => {
        if (!source || hasAutoStartedRef.current) return;
        // GATING: Only trigger auto-start for sources created in the last 15 minutes to avoid re-running legacy data
        const createdAt = source.createdAt ? new Date(source.createdAt).getTime() : 0;
        const isFresh = createdAt > 0 && (Date.now() - createdAt < 15 * 60 * 1000);

        // autoRunSignal takes precedence over user preference autoStart
        const shouldRun = autoRunSignal || (autoStart && isFresh);
        
        if (shouldRun && activeIndex < STAGES.length && !isRunningAllRef.current && !executingStage && source.status === "idle") {
            const timer = setTimeout(() => {
                if (source.status === "idle" && !hasAutoStartedRef.current) {
                    hasAutoStartedRef.current = true
                    console.log("[Pipeline] Auto-starting via signal:", autoRunSignal ? "URL" : "Preference");
                    runFullPipeline();
                }
            }, 1000); 
            return () => clearTimeout(timer);
        }
    }, [autoStart, autoRunSignal, activeIndex, isRunningAll, executingStage, source.status, source.createdAt, id, runFullPipeline]);

    const runStage = async (stageId: StageId) => {
        const stage = STAGES.find(s => s.id === stageId)
        if (stage) await executeStage(stage)
    }

    // Execute a workflow stage
    const executeStage = async (stage: WorkflowStage) => {
        // SILENT SKIP: If a stage has no API endpoint, it's an internal/bundled stage
        // We skip it silently to keep the processing logs professional.
        if (!stage.apiEndpoint || !stage.apiBody) return

        // ════ STAGE GATING ════
        const gate = validateStageGating(stage.id, stageResults)
        if (!gate.valid) {
            setError({ message: `Prerequisite missing: ${gate.missing}. Please run previous stages first.`, type: gate.type || "error" })
            setLogs(prev => [{ event: `Blocked: ${stage.label} requires ${gate.missing}`, time: "Just now", status: gate.type === "info" ? "info" : "error" }, ...prev])
            return
        }

        setExecutingStage(stage.id)
        setError(null)

        try {
            const bodyPayload = (stage.id === "draft" || stage.id === "angle")
                ? stage.apiBody(id, { type: intentType, audience: intentAudience, tone: intentTone })
                : stage.apiBody(id)
            
            // Critical fix: Ensure language is propagated for all single-stage executions
            // as recommended by CodeRabbit audit.
            if (bodyPayload && !bodyPayload.language) {
                bodyPayload.language = lang;
            }

            // ═══ LOCAL MOCK BYPASS ═══
            // If the source is a local import, don't hit the real API
            if (id.startsWith("local-")) {
                await new Promise(r => setTimeout(r, 100)) // Simulate network latency
                
                let mockData: Record<string, unknown> = { status: "success", message: `${stage.label} completed for local file` }
                
                if (stage.id === "judge") mockData = { result: { title: source?.title || "Local File", channel: "Local File", url: "file://local", score: 8 } }
                if (stage.id === "transcript") mockData = { result: { segments: [{ start: 0, text: "This is a mock transcript for your local file import. It contains the key arguments and discussions from the meeting." }] } }
                if (stage.id === "refine") mockData = { result: { segments: [{ text: "Refined and structured transcript data for the local file." }] } }
                if (stage.id === "insights") mockData = { result: { core_argument: "Local data is critical for strategic decision making.", key_claims: ["High security", "Fast processing"], memorable_quotes: ["Data is the new oil."] } }
                if (stage.id === "angle") mockData = { result: { recommended_format: "Podcast", framing_angle: "The future of local computing", working_titles: ["Local First Strategy"] } }
                if (stage.id === "draft") mockData = { result: { title: "Local Impact Analysis", content: "# Local Impact Analysis\n\nThis is a generated draft based on your local import.\n\n## Key Findings\n- Local files are processed faster.\n- Privacy is maintained." } }
                
                const data = mockData
                // Store result
                setStageResults(prev => ({ ...prev, [stage.id]: (data.result || data) as StageResultData }))
                setCompletedStages(prev => new Set([...prev, stage.id]))
                
                // Persist to localStorage for local imports
                const localKey = `distill_results_${id}`;
                const existing = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(localKey) || "{}") : {};
                if (typeof window !== 'undefined') localStorage.setItem(localKey, JSON.stringify({ ...existing, [stage.id]: data.result || data }));
                
                if (stage.id === "qa" && (data.result as Record<string, unknown>)?.total_score !== undefined) {
                    setSource(s => ({
                        ...s,
                        score: (data.result as Record<string, unknown>).total_score as number,
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

            let data: StagePayload | null = null;
            
            // Handle streaming for all long-running stages (Draft, Insights, Strategize, Analyze, Socialise)
            if ((stage.id === "draft" || stage.id === "insights" || stage.id === "angle" || stage.id === "cluster" || stage.id === "qa" || stage.id === "socialise") && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = "";
                let buffer = "";
                let shouldAbort = false;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || shouldAbort) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            const parsed = JSON.parse(trimmed);
                            if (parsed.type === "status") {
                                setLogs(prev => [{ event: parsed.text, time: "Just now", status: "info" as const }, ...prev]);
                            } else if (parsed.type === "chunk" && (parsed as StreamChunk).text) {
                                fullContent += (parsed as StreamChunk).text as string;
                                setStageResults(prev => ({ 
                                    ...prev, 
                                    [stage.id]: { 
                                        result: { 
                                            content: fullContent, 
                                            title: "Generating Draft...",
                                            word_count: fullContent.trim().split(/\s+/).filter(Boolean).length
                                        } 
                                    } 
                                }));
                            } else if (parsed.type === "payload") {
                                // Captured final JSON payload from the stream (e.g. angle strategy)
                                data = { status: "success", result: parsed.data };
                            } else if (parsed.type === "error") {
                                // CRITICAL: Stop the stream and report backend error
                                setError({ message: parsed.message || parsed.error || "A streaming error occurred", type: "error" });
                                setLogs(prev => [{ event: `${stage.label} failed: ${parsed.message || parsed.error}`, time: "Just now", status: "error" }, ...prev]);
                                shouldAbort = true;
                                setExecutingStage(null);
                                break;
                            } else if (parsed.type === "success" || parsed.status === "success" || (parsed as StagePayload).data) {
                                // Capture final payload if it comes with the success signal
                                data = data || (parsed as StagePayload);
                            }
                        } catch {
                            // Minor parse issues during stream are ignored
                        }
                    }
                }
                
                if (shouldAbort) return;

                if (!data && fullContent) {
                    data = { status: "success", result: { content: fullContent } };
                }
            } else {
                const responseData = await res.json()
                if (!res.ok) throw new Error(responseData.error || "Execution failed")
                data = responseData as StagePayload
            }

            // Store result (with Cluster-Aware unwrapping to populate constituent panels)
            const resValue = (data?.result || data) as StageResultData
            setStageResults(prev => {
                const next = { ...prev, [stage.id]: resValue };
                
                // If this was a cluster, we hydrate the individual stages it represents
                if (stage.id === 'cluster') {
                    const cluster = resValue as any;
                    if (cluster.results) {
                        if (cluster.results.refine) next.refine = cluster.results.refine;
                        if (cluster.results.summary) next.summary = cluster.results.summary;
                        if (cluster.results.insights) next.insights = cluster.results.insights;
                    } else {
                        // Support flat fallback
                        next.insights = resValue;
                        next.summary = resValue;
                    }
                }
                return next;
            })

            // Mark completed (with Cluster-Aware ID expansion)
            setCompletedStages(prev => {
                const next = new Set(prev);
                next.add(stage.id as StageId);
                
                if (stage.id === 'cluster') {
                    next.add('transcript');
                    next.add('summary');
                    next.add('insights');
                }
                return next;
            })

            // ─── REACTIVE PANEL SYNC ───
            // If the panel is open for this stage, refresh it immediately
            if (panelContent && panelContent.stageId === stage.id) {
                setPanelContent({
                    ...panelContent,
                    data: resValue
                });
            }
            // ───────────────────────────

                // ─── METADATA FIXATION (Prisma Sync) ───
                if (data && typeof data === 'object') {
                    const resObj = ((data as StagePayload).result || data) as Record<string, unknown>;
                    const updates: Partial<SourceCandidate> = {};

                    // 1. Sync Score (DQM)
                    if (resObj && (resObj.score !== undefined || resObj.total_score !== undefined)) {
                        const score = (resObj.total_score ?? (resObj.score as number)) as number;
                        setSource(s => s ? ({ ...s, score, status: score >= 6 ? "done" : s.status }) : s);
                        updates.score = score;
                        if (score >= 6) updates.status = "done";
                    }

                    // 2. Sync Duration (Transcript)
                    if (stage.id === "transcript" && resObj?.duration) {
                        const formattedDur = formatDuration(resObj.duration as number | string);
                        setSource(s => s ? ({ ...s, duration: formattedDur }) : s);
                        updates.duration = formattedDur;
                    }

                    // 3. Sync Identity (Judge)
                    if (stage.id === "judge") {
                        const judgeRes = resObj as unknown as JudgeResult;
                        const title = judgeRes.title || source?.title;
                        const channel = judgeRes.channel || source?.channel;
                        const url = judgeRes.url || source?.url;
                        
                        updates.title = title;
                        updates.channel = channel;
                        updates.url = url;
                        
                        setSource(s => s ? ({ ...s, ...updates }) : s);
                    }

                    // Persist all gathered updates to Prisma in a single atomic call
                    if (Object.keys(updates).length > 0) {
                        try {
                            await fetch("/api/store", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ 
                                    action: "upsert", 
                                    source: { id, ...updates } 
                                })
                            });
                        } catch (e) { console.error("Prisma fixation failed:", e); }
                    }
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
            setError({ message: msg, type: "error" })
            setLogs(prev => [{ event: `${stage.label} failed: ${msg}`, time: "Just now", status: "error" }, ...prev])
            // ABORT: If a stage fails, we must stop the entire 'Run All' sequence
            if (isRunningAll) { isRunningAllRef.current = false; setIsRunningAll(false) }
        } finally {
            setExecutingStage(null)
            // CELEBRATION HARDENING: Only show celebration if the FINAL stage was reached AND completed
            if (stage.id === "socialise" && !error) {
                setSource(s => ({ ...s, status: "done" }))
                setShowCelebration(true)
            }
        }
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this source? This action cannot be undone.")) return

        try {
            const res = await fetch("/api/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", id })
            })
            if (res.ok) {
                router.push("/sources")
            } else {
                const data = await res.json()
                setError({ message: data.error || "Delete failed", type: "error" })
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error"
            setError({ message: msg, type: "error" })
        }
    }


    const openPanel = async (stage: WorkflowStage) => {
        let data = stageResults[stage.id]
        
        // Lazy Hydration: If missing but stage is complete, try to fetch from API
        if (!data && completedStages.has(stage.id)) {
            setExecutingStage(stage.id)
            try {
                const res = await fetch("/api/store", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "get_result", sourceId: id, stageId: stage.id })
                })
                if (res.ok) {
                    const json = await res.json()
                    // json.result = the raw artifact from Supabase
                    // Cluster artifact shape: { status, source_id, results: { refine, summary, packet, insights } }
                    // Other artifacts: raw data objects
                    const rawResult = json.result
                    
                    let dataValue: StageResultData | null = null
                    
                    if (stage.id === 'cluster' || stage.id === 'insights' || stage.id === 'summary') {
                        // Cluster artifact — extract the constituent results AND hydrate siblings
                        const clusterResults = rawResult?.results || rawResult
                        if (clusterResults) {
                            setStageResults(prev => {
                                const next = { ...prev }
                                if (clusterResults.insights) next.insights = clusterResults.insights as StageResultData
                                if (clusterResults.summary) next.summary = clusterResults.summary as StageResultData
                                if (clusterResults.packet) next.packet = clusterResults.packet as StageResultData
                                if (clusterResults.refine) next.refine = clusterResults.refine as StageResultData
                                next.cluster = clusterResults as StageResultData
                                return next
                            })
                            // Use the insights data as the display payload for cluster/insights
                            dataValue = (clusterResults.insights || clusterResults.summary || clusterResults) as StageResultData
                        }
                    } else {
                        // Standard artifact — unwrap common wrappers
                        dataValue = (rawResult?.data || rawResult?.result || rawResult) as StageResultData
                        if (dataValue) {
                            setStageResults(prev => ({ ...prev, [stage.id]: dataValue! }))
                        }
                    }
                    
                    if (dataValue) data = dataValue

                }
            } catch (e) {
                console.error(`Failed to hydrate ${stage.id}:`, e)
            } finally {
                setExecutingStage(null)
            }
        }

        if (data) {
            // Summary stage might have nested result (e.g., { summary: "..." })
            // Unified handling for standard response wrappers
            const displayData = stage.id === "summary" 
                ? ((data as StagePayload).summary || (data as StagePayload).result || (data as StagePayload).payload || data) 
                : ((data as StagePayload).result || (data as StagePayload).payload || data)
            setPanelContent({ title: stage.label, stageId: stage.id, data: displayData })
        } else {
            // Open the panel with a fallback message if it was marked complete but no local payload is found
            setPanelContent({ title: stage.label, stageId: stage.id, data: { status: "Stage complete", message: "No local result data to display." } })
        }
    }

    // Pipeline stage filtering & status calculation
    const visibleStages = STAGES.filter(s => !s.hidden);


    if (!source || !source.id || (source.title === "..." && source.channel === "...")) {
        return <MissionControlSkeleton />;
    }

    return (
        <div className="flex h-full">
            {/* Main Content Area */}
            <div className={cn("flex-1 overflow-y-auto transition-all duration-300", panelContent ? "pr-0" : "")}>
                <div className="p-8 max-w-[1100px] mx-auto space-y-8 animate-in fade-in duration-500">

                    {/* Back Link & Global Actions */}
                    <div className="flex items-center justify-between pb-4 border-b border-border/40">
                        <div className="flex items-center gap-4">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 px-3 border-border/40 bg-zinc-900/5 dark:bg-zinc-100/10 hover:bg-zinc-900/10 dark:hover:bg-zinc-100/20 text-muted-foreground hover:text-foreground"
                                onClick={() => router.push("/sources")}
                                title={t("backToLibrary")}
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" /> 
                                {t("viewAll")} {t("sources")}
                            </Button>
                        </div>

                        <div className="flex items-center gap-3">
                            <a 
                                href={source.url === "#" ? undefined : source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full border border-border/40 bg-zinc-900/5 dark:bg-zinc-100/10 text-muted-foreground hover:text-foreground hover:bg-zinc-900/10 dark:hover:bg-zinc-100/20 transition-all",
                                    source.url === "#" && "opacity-20 cursor-not-allowed pointer-events-none"
                                )}
                                title="Open original source"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            
                            <div className="relative group/menu">
                                <button 
                                    className="w-10 h-10 flex items-center justify-center rounded-full border border-border/40 bg-zinc-900/5 dark:bg-zinc-100/10 text-muted-foreground hover:text-foreground hover:bg-zinc-900/10 dark:hover:bg-zinc-100/20 transition-all"
                                    title="More actions"
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border/60 rounded-xl shadow-xl shadow-black/20 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 p-1">
                                    <button 
                                        onClick={() => runFullPipeline()}
                                        disabled={isRunningAll}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        Run Full Pipeline
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setStageResults(prev => {
                                                const next = { ...prev }
                                                delete next.draft
                                                delete next.qa
                                                return next
                                            })
                                            setCompletedStages(prev => {
                                                const next = new Set(prev)
                                                next.delete("draft")
                                                next.delete("qa")
                                                return next
                                            })
                                            runStage("draft")
                                        }}
                                        disabled={isRunningAll}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        Regenerate Draft
                                    </button>
                                    <button 
                                        onClick={handleDelete}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* ─── Global Error/Info Banner ─── */}
                    {error && (
                        <div className={cn(
                            "p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                            error.type === "info" 
                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                                : "bg-destructive/10 border-destructive/20 text-destructive-foreground font-medium"
                        )}>
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                error.type === "info" ? "bg-blue-500/20" : "bg-destructive/20"
                            )}>
                                {error.type === "info" ? (
                                    <Target className="w-4 h-4 text-blue-400" />
                                ) : (
                                    <X className="w-4 h-4 text-destructive-foreground" onClick={() => setError(null)} />
                                )}
                            </div>
                            <span className="text-sm font-medium">{error.message}</span>
                        </div>
                    )}

                    {/* ─── SOURCE HEADER ─── */}
                    <div className="flex flex-col gap-8 pb-4">
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="bg-brand/10 text-brand border-brand/20 uppercase tracking-widest text-[10px] h-5 px-2 font-bold italic">
                                    {{
                                        youtube: "YouTube",
                                        spotify_podcast: "Spotify Podcast",
                                        apple_podcast: "Apple Podcast",
                                        podcast: "Podcast",
                                        spotify: "Spotify Podcast",
                                        vimeo: "Vimeo",
                                        rss: "RSS / Article",
                                        twitter: "X / Twitter",
                                        document: "Document",
                                        upload: "Upload",
                                        recording: "Recording",
                                    }[source?.source_type ?? ""] || source?.source_type || "Source"}
                                </Badge>
                                {source.status === "done" && (
                                    <Badge variant="success" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 uppercase tracking-widest text-[10px] h-5 px-2 font-bold">
                                        Completed
                                    </Badge>
                                )}
                                {(() => {
                                    const tr = stageResults.transcript as { used_url?: string; result?: { used_url?: string }; data?: { used_url?: string } };
                                    const usedUrl = tr?.used_url || tr?.result?.used_url || tr?.data?.used_url;
                                    return usedUrl?.includes('ytsearch') ? (
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 uppercase tracking-widest text-[10px] h-5 px-2 font-bold animate-pulse">
                                            Sourced via YouTube Search
                                        </Badge>
                                    ) : null;
                                })()}
                            </div>
                            <h1 className="text-4xl font-bold tracking-tight text-foreground font-serif leading-tight max-w-4xl">
                                {source?.title}
                            </h1>
                        </div>

                        {/* ─── SOURCE SUMMARY OVERVIEW REMOVED (Redundant with panels) ─── */}
                    </div>

                    {/* Metadata Row — Now spans full width above the content grid */}
                    <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-muted/30 border border-border/60 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                            <span className="text-muted-foreground">{t("dateAdded")}</span>
                            <span className="font-medium">{source?.published || "Recently"}</span>
                        </div>
                        <div className="w-px h-4 bg-border/60 hidden sm:block" />
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                            <span className="text-muted-foreground">{t("duration")}</span>
                            <span className="font-medium">{source?.duration || "—"}</span>
                        </div>
                        <div className="w-px h-4 bg-border/60 hidden sm:block" />
                        <div className="flex items-center gap-2 text-sm">
                            <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/70" />
                            <span className="text-muted-foreground">{t("qualScore")}</span>
                            {(() => {
                                const score = source?.score || 0;
                                const normalizedScore = score > 10 ? score : score * 10;
                                return (
                                    <>
                                        <span className={cn("font-semibold tabular-nums", score > 0 ? (normalizedScore >= 80 ? "text-emerald-600" : normalizedScore >= 60 ? "text-amber-600" : "text-red-500") : "text-muted-foreground")}>
                                            {score > 0 ? (score > 10 ? `${score}/100` : `${score}/10`) : (stageResults.qa ? <span className="text-muted-foreground opacity-50">Calculating...</span> : <span className="opacity-70 font-normal italic">{t("pending")}...</span>)}
                                        </span>
                                        {score > 0 && (
                                            <span className={cn("text-xs px-1.5 py-0.5 rounded-md font-medium", normalizedScore >= 80 ? "bg-emerald-50 text-emerald-700" : normalizedScore >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600")}>
                                                {normalizedScore >= 80 ? "Exceptional" : normalizedScore >= 60 ? "Solid" : "Low score"}
                                            </span>
                                        )}
                                    </>
                                )
                            })()}
                        </div>
                    </div>

                    {/* ═══ TWO-COLUMN GRID — Balanced alignment ═══ */}
                    <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">

                        {/* ═══ LEFT COLUMN (Pipeline Stages) ═══ */}
                        <div className="space-y-8">

                            {/* ═══ PROGRESSIVE WORKFLOW ACTION STACK ═══ */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest font-serif">{t("pipelineStages")}</h2>
                                    {activeIndex < STAGES.length && (
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className={cn(
                                                            "gap-1.5 h-8 text-[12px] rounded-lg font-bold transition-all duration-300 border-none",
                                                            isRunningAll ? "bg-emerald-500/90 text-white animate-pulse-vibrant opacity-60" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/10"
                                                        )}
                                                        onClick={() => runFullPipeline(activeIndex > 0)}
                                                        disabled={isRunningAll || !!executingStage}
                                                    >
                                                        {isRunningAll ? (
                                                            <><RefreshCw className="w-[14px] h-[14px] text-white animate-spin-slow" /> <span className="dots-animate">{t("processing")}</span></>
                                                        ) : activeIndex > 0 ? (
                                                            <>{t("continuePipeline")}</>
                                                        ) : (
                                                            <><Play className="w-[14px] h-[14px] fill-current" /> {t("runPipeline")}</>
                                                        )}
                                                    </Button>
                                            )}
                                        </div>
    
                                        <div className="space-y-0 relative">
                                            {visibleStages.map((stage, i) => {
                                                const status = getStageStatus(STAGES.findIndex(s => s.id === stage.id))
                                                const isCompleted = status === "completed"
                                                const isActive = status === "active"
                                                const isLocked = status === "locked"
    
                                                return (
                                                    <div key={stage.id} className="group/stage relative flex">
                                                        {/* Left Side: Timeline Column */}
                                                        <div className="flex flex-col items-center w-10 shrink-0 relative">
                                                            {/* Vertical Connector Lines */}
                                                            <div className={cn(
                                                                "absolute left-[19px] w-[2px] transition-colors duration-500",
                                                                i === 0 ? "top-[12px] h-[calc(100%-12px)]" : i === visibleStages.length - 1 ? "top-0 h-[12px]" : "top-0 h-full",
                                                                (isCompleted || isActive) ? "bg-emerald-500/30" : "bg-border/40"
                                                            )} />
                                                            
                                                            {/* Status Circle */}
                                                            <div className={cn(
                                                                "w-6 h-6 rounded-full border-2 flex items-center justify-center bg-background z-10 transition-all duration-500",
                                                                isCompleted ? "border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : 
                                                                isActive ? "border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "border-border/60"
                                                            )}>
                                                                {isCompleted ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : 
                                                                 isActive ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
                                                            </div>
                                                        </div>
    
                                                        {/* Right Side: Stage Content */}
                                                        <div className={cn(
                                                            "flex-1 pb-10 transition-all duration-300 ml-2",
                                                            isLocked && "opacity-50"
                                                        )}>
                                                            <div className="flex items-start justify-between group/row">
                                                                <div className="space-y-1">
                                                                    <h3 className={cn(
                                                                        "text-[15px] font-medium transition-colors",
                                                                        isCompleted || isActive ? "text-foreground" : "text-muted-foreground"
                                                                    )}>
                                                                            {stage.label}
                                                                        </h3>
                                                                        <p className="text-[13px] text-muted-foreground/70 leading-relaxed max-w-md">
                                                                            {stage.id === "transcript" && source?.transcriptStatus === "unavailable" 
                                                                                ? "Audio restricted by platform. Proceeding with high-fidelity Context Intelligence analysis."
                                                                                : isActive && stage.id === "angle"
                                                                                  ? (INTENT_DESCRIPTIONS[intentType] || stage.description)
                                                                                  : stage.id === "draft" 
                                                                                    ? `Generate ${intentType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} for ${intentAudience.replace(/_/g, " ")} target.`
                                                                                    : stage.description}
                                                                        </p>
                                                                    </div>
        
                                                                {/* Primary Action Button Cluster */}
                                                                <div className="flex items-center gap-4">
                                                                    {/* View Button (Primary for completed stages) */}
                                                                     {(isCompleted || !!stageResults[stage.id]) && (
                                                                         <Button
                                                                             variant="outline"
                                                                             size="sm"
                                                                             onClick={(e) => { e.stopPropagation(); openPanel(stage) }}
                                                                             title={`View ${stage.label} results`}
                                                                             className="h-8 px-4 border-emerald-500/30 bg-emerald-500/5 text-[12px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all rounded-lg"
                                                                         >
                                                                             {{
                                                                                 judge: "View Profile",
                                                                                 transcript: source?.transcriptStatus === "transcribed" ? "View Transcript" : "View Metadata",
                                                                                 insights: "View Insights",
                                                                                 summary: "View Summary",
                                                                                 draft: "View Draft",
                                                                                 qa: "View Matrix",
                                                                                 socialise: "View Assets",
                                                                                 cluster: "View Analysis",
                                                                                 angle: "View Strategy",
                                                                                 packet: "View Density",
                                                                                 refine: "View Refinement",
                                                                                 export: "Export"
                                                                             }[stage.id] || "View"}
                                                                         </Button>
                                                                     )}
                                                                </div>
                                                            </div>

                                                    {/* Writing Intent Setup automatically appears when Insights are ready */}
                                                    {stage.id === "angle" && (completedStages.has("insights") || !!stageResults.insights || !!stageResults.cluster) && !completedStages.has("draft") && (
                                                        <div className="mt-8 p-8 rounded-[2rem] bg-card border border-border/80 shadow-soft animate-in fade-in slide-in-from-top-2 flex flex-col gap-6 w-full lg:max-w-3xl" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Bot className="w-4 h-4 text-brand" />
                                                                <h4 className="text-[12px] font-bold text-foreground uppercase tracking-wider font-serif">Writing Intent Strategy</h4>
                                                            </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                                    {/* Content Type */}
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Format</label>
                                                                        <div className="relative">
                                                                                <select
                                                                                    value={intentType}
                                                                                    onChange={(e) => { setIntentType(e.target.value); invalidateStrategy(); }}
                                                                                    title="Select content format"
                                                                                    className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg !px-3 !pr-8 w-full focus:ring-1 focus:ring-brand shadow-micro appearance-none !bg-none transition-all"
                                                                                >
                                                                                <option value="blog_article">Blog Article</option>
                                                                                <option value="essay">Thematic Essay</option>
                                                                                <option value="technical_breakdown">Technical Breakdown</option>
                                                                                <option value="explainer">Explainer</option>
                                                                            </select>
                                                                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                                                                <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Audience</label>
                                                                        <div className="relative">
                                                                                <select
                                                                                    value={intentAudience}
                                                                                    onChange={(e) => { setIntentAudience(e.target.value); invalidateStrategy(); }}
                                                                                    title="Select target audience"
                                                                                    className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg !px-3 !pr-8 w-full focus:ring-1 focus:ring-brand shadow-micro appearance-none !bg-none transition-all"
                                                                                >
                                                                                <option value="general">General Reader</option>
                                                                                <option value="professional">Professional</option>
                                                                                <option value="founder">Founder / Operator</option>
                                                                                <option value="technical">Technical</option>
                                                                            </select>
                                                                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                                                                <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Tone</label>
                                                                        <div className="relative">
                                                                                <select
                                                                                    value={intentTone}
                                                                                    onChange={(e) => { setIntentTone(e.target.value); invalidateStrategy(); }}
                                                                                    title="Select voice and tone"
                                                                                    className="h-9 text-xs bg-muted/20 border border-border/60 rounded-lg !px-3 !pr-8 w-full focus:ring-1 focus:ring-brand shadow-micro appearance-none !bg-none transition-all"
                                                                                >
                                                                                <option value="professional">Professional</option>
                                                                                <option value="witty">Witty & Sharp</option>
                                                                                <option value="academic">Academic</option>
                                                                                <option value="bold">Bold & Provocative</option>
                                                                            </select>
                                                                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                                                                <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            <div className="flex items-center justify-between mt-1 pt-4 border-t border-border/50">
                                                                <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                                                                    <Sparkles className="w-3 h-3" />
                                                                    Intent confirmed. Strategizing editorial angle next.
                                                                </p>
                                                                <Button 
                                                                    size="sm" 
                                                                    className={cn(
                                                                        "h-8 px-5 rounded-full font-semibold transition-all flex items-center gap-1.5",
                                                                        (isRunningAll || executingStage === "angle") 
                                                                            ? "bg-emerald-500 text-white animate-pulse-vibrant opacity-60" 
                                                                            : "bg-white text-zinc-900 shadow-sm hover:bg-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                                                                    )}
                                                                     onClick={(e) => { e.stopPropagation(); runFullPipeline(true); }}
                                                                     disabled={isRunningAll || !!executingStage}
                                                                 >
                                                                     {isRunningAll || executingStage === "angle" ? (
                                                                         <><RefreshCw className="w-[14px] h-[14px] text-white animate-spin-slow"/> <span className="dots-animate">Processing</span></>
                                                                     ) : (
                                                                         <><Play className="w-[14px] h-[14px] fill-current"/> Continue Pipeline</>
                                                                     )}
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
                                    <div className="mt-6 p-6 rounded-2xl bg-zinc-950 dark:bg-white border border-zinc-900 dark:border-zinc-200 text-center shadow-2xl shadow-emerald-500/10 animate-in zoom-in-95 duration-500">
                                        <p className="text-[15px] font-serif font-bold tracking-tight text-white dark:text-black">{t("allStagesComplete")}</p>
                                        <p className="text-[13px] text-emerald-400 dark:text-emerald-600 font-medium mt-1.5">{t("sourceProcessed")}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN ═══ */}
                        <div className="space-y-5">
                            
                            {/* Processing Logs — Now Primary Right Rail Element */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest leading-none font-serif">
                                        {t("processingLog")}
                                    </h3>
                                    {isRunningAll && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 animate-pulse">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                            <span className="text-[10px] font-bold text-brand uppercase tracking-tight">Active</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="rounded-xl border border-border/60 bg-background p-5 space-y-4 shadow-sm animate-in fade-in duration-500">
                                    <div className="space-y-0 text-left max-h-[500px] overflow-y-auto pr-1">
                                        {logs.length === 0 ? (
                                             <div className="py-8 text-center">
                                                <p className="text-xs text-muted-foreground italic">No logs generated yet.</p>
                                             </div>
                                        ) : logs.map((log, i) => (
                                            <div key={i} className={cn(
                                                "flex items-start gap-3 py-3 px-2 rounded-lg transition-colors group/log",
                                                "hover:bg-muted/30",
                                                i < logs.length - 1 && "border-b border-border/30 hover:border-transparent"
                                            )}>
                                                <div className={cn(
                                                    "w-[6px] h-[6px] rounded-full mt-1.5 shrink-0 transition-transform group-hover/log:scale-125",
                                                    log.status === "success" && "bg-emerald-500",
                                                    log.status === "error" && "bg-red-500",
                                                    log.status === "info" && "bg-blue-500/40"
                                                )} />
                                                <div className="flex-1 space-y-0.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tight leading-none">
                                                            {log.status.toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground/40 font-mono">
                                                            {log.time}
                                                        </span>
                                                    </div>
                                                    <p className="text-[12px] text-foreground/90 font-medium leading-tight">
                                                        {log.event}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Info Card / Helpful Context — Minimal and clean */}
                            <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-3">
                                <h3 className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest font-serif">Mission Intelligence</h3>
                                <p className="text-[12px] text-muted-foreground leading-relaxed">
                                    Distill Engine handles parallel fetching and OpenAI-powered transcription. Quality checks are run at the Analysis Matrix stage.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ SIDE PANEL / DETAIL DRAWER ═══ */}
            {panelContent && (
                <div className="fixed inset-y-0 right-0 z-50 w-full h-[100dvh] lg:static lg:w-[480px] lg:h-full shrink-0 border-l border-border/60 bg-background/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-right-4 duration-300">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-border/60 shrink-0">
                        <h3 className="text-[17px] font-semibold tracking-tight font-serif">{panelContent.title}</h3>
                        <button onClick={() => setPanelContent(null)} aria-label="Close panel" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div 
                        className="flex-1 overflow-y-auto overscroll-contain p-6 pb-[calc(1.5rem+64px)] lg:pb-6 touch-pan-y"
                    >
                        {panelContent.stageId && (
                            <StageResultPanel stageId={panelContent.stageId} data={panelContent.data as Record<string, unknown>} sourceId={id} />
                        )}
                    </div>
                </div>
            )}
            {/* ═══ CELEBRATION OVERLAY ═══ */}
            <AnimatePresence>
                {showCelebration && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                    >
                        {/* Multiple confetti particles using framer-motion */}
                        {[...Array(20)].map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ 
                                    x: 0, 
                                    y: 0, 
                                    opacity: 1, 
                                    scale: Math.random() * 0.5 + 0.5,
                                    rotate: 0 
                                }}
                                animate={{ 
                                    x: (Math.random() - 0.5) * 1000, 
                                    y: (Math.random() - 0.5) * 1000, 
                                    opacity: 0,
                                    rotate: Math.random() * 360 
                                }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                className="absolute w-3 h-3 rounded-sm"
                                style={{ 
                                    backgroundColor: ["#10b981", "#34d399", "#6ee7b7", "#059669", "#fbbf24"][Math.floor(Math.random() * 5)] 
                                }}
                            />
                        ))}
                        
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0, y: 20 }}
                            className="bg-card/90 backdrop-blur-xl border border-emerald-500/30 p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 pointer-events-auto max-w-sm text-center"
                        >
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2">
                                <ShieldCheck className="w-8 h-8 text-emerald-500" />
                            </div>
                            <h2 className="text-2xl font-serif font-bold text-foreground">Pipeline Complete</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Your source has been successfully distilled, analyzed, and socialized. 
                                High-fidelity assets are ready for distribution.
                            </p>
                            <Button 
                                onClick={() => setShowCelebration(false)}
                                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-8"
                            >
                                Continue to Studio
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
