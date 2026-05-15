import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { AlertCircle, Target, Share2 as ShareIcon, Copy, Check, Lightbulb, Zap, BookOpen, MessageSquareQuote, BarChart3, Send, CheckCircle2 } from "lucide-react"
import DQMCard, { DQMData } from "./DQMCard"
import { PublishDropdown } from "@/components/features/PublishDropdown"
import Image from "next/image"

type StageId = "judge" | "transcript" | "refine" | "cluster" | "summary" | "packet" | "insights" | "angle" | "draft" | "visual" | "qa" | "socialise" | "export"

interface StageResultViewProps {
    stageId: StageId
    data: Record<string, unknown> | string
    sourceId?: string
    compact?: boolean // for accordion vs full panel
}


// Helper to safely access nested data
function get(obj: Record<string, unknown>, key: string, fallback: unknown = ""): unknown {
    if (!obj) return fallback
    if (obj[key] !== undefined) return obj[key]
    // Check nested "payload" (common in our adapters)
    const payload = obj?.payload as Record<string, unknown> | undefined
    if (payload && payload[key] !== undefined) return payload[key]
    // Check nested "data" field (common in API responses)
    const data = obj.data as Record<string, unknown> | undefined
    if (data && data[key] !== undefined) return data[key]
    // Check nested "result" (common in page.tsx streaming or fetch fallbacks)
    const result = obj.result as Record<string, unknown> | undefined
    if (result && result[key] !== undefined) return result[key]
    return fallback
}

function getStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
    const val = get(obj, key, fallback)
    return typeof val === "string" ? val : String(val || fallback)
}

function getArr(obj: Record<string, unknown> | unknown[], key: string): unknown[] {
    if (Array.isArray(obj)) return obj
    const val = get(obj as Record<string, unknown>, key, [])
    return Array.isArray(val) ? val : []
}

function getNum(obj: Record<string, unknown>, key: string, fallback = 0): number {
    const val = get(obj, key, fallback)
    return typeof val === "number" ? val : fallback
}

const ENTITY_NORMALIZATION: Record<string, string> = {
    "mold ga": "Mo Gawdat",
    "mo gaddat": "Mo Gawdat",
    "mo gadat": "Mo Gawdat",
    "mo chat": "Mo Gawdat",
    "aeo": "Answer Engine Optimization",
    "dqm": "Digital Quality Matrix"
}

function normalizeText(text: string): string {
    if (!text) return text
    let normalized = text
    Object.entries(ENTITY_NORMALIZATION).forEach(([key, value]) => {
        const regex = new RegExp(`\\b${key}\\b`, "gi")
        normalized = normalized.replace(regex, value)
    })
    return normalized
}

// STRUCTURAL GUARD: Sanitization filter to hide model field names and JSON leakage from UI
const FORBIDDEN_STRINGS = [
    "source_context", "contradictions", "frameworks", "controversies", "implications",
    "core_argument", "key_claims", "memorable_quotes", "[]", "{}", "join()", "? join"
];

function shouldFilterInsight(text: string): boolean {
    if (!text) return true;
    const lower = text.toLowerCase();
    
    // Check for exact model field names or code snippets
    if (FORBIDDEN_STRINGS.some(forbidden => lower.includes(forbidden.toLowerCase()))) {
        return true;
    }

    // Filter out strings that look like raw code or empty array syntax
    if (lower.trim() === "[]" || lower.trim() === "{}") return true;
    
    // Filter out strings that are just punctuation or too short/generic
    if (text.length < 3 && !text.match(/[a-z]/i)) return true;

    return false;
}

// ─── Per-Stage Renderers ────────────────────────────────────────

function JudgeResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    if (!data) return <div className="p-4 text-xs text-muted-foreground italic">Judging in progress...</div>
    const score = getNum(data, "score")
    const normalizedScore = score > 10 ? score : score * 10
    const status = getStr(data, "status")
    const rationale = getStr(data, "rationale", "Source evaluated based on NorthStar alignment criteria.")

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className={cn(
                    "text-2xl font-bold tabular-nums",
                    normalizedScore >= 80 ? "text-emerald-600" : normalizedScore >= 60 ? "text-amber-600" : "text-red-500"
                )}>
                    {score > 10 ? `${score}/100` : `${score}/10`}
                </div>
                <Badge variant={status === "done" ? "success" : "secondary"}>
                    {normalizedScore >= 80 ? "High Signal" : normalizedScore >= 60 ? "Moderate Signal" : "Low Signal"}
                </Badge>
            </div>
            {!compact && (
                <p className="text-sm text-muted-foreground leading-relaxed">{rationale}</p>
            )}
        </div>
    )
}

function TranscriptResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const segments = getArr(data, "segments")
    const segmentCount = segments.length || getNum(data, "segment_count", 0)
    const status = getStr(data, "status")
    const isRescued = status === "rescued_text"

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="secondary">
                    {segmentCount} {isRescued ? "content block" : "segments"} retrieved
                </Badge>
            </div>
        )
    }

    // Format seconds → M:SS
    function fmtTime(secs: number): string {
        const m = Math.floor(secs / 60)
        const s = Math.floor(secs % 60)
        return `${m}:${String(s).padStart(2, "0")}`
    }

    return (
        <div className="space-y-4">
            {/* Header bar */}
            <div className="flex items-center gap-2 flex-wrap border-b border-border/30 pb-3">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted/40 border border-border/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                        {segmentCount} {isRescued ? "blocks" : "segments"}
                    </span>
                </div>
                {isRescued && (
                    <Badge variant="success" className="bg-brand/10 text-brand border-brand/20 h-6 text-[10px]">
                        Rescued Metadata
                    </Badge>
                )}
            </div>

            {isRescued && (
                <div className="p-3 rounded-lg bg-brand/5 border border-brand/10 text-xs text-muted-foreground/70 leading-relaxed italic">
                    Audio transcription was unavailable. Content rescued from source metadata.
                </div>
            )}

            {/* Transcript body — each segment is its own row */}
            <div className="space-y-0">
                {segments.length > 0 ? segments.map((seg, i) => {
                    const s = seg as Record<string, unknown>
                    const rawText = normalizeText(getStr(s, "text").trim())
                    const start = getNum(s, "start")

                    if (!rawText) return null

                    return (
                        <div
                            key={i}
                            className="group flex gap-3 items-baseline py-[3px] px-2 rounded-md hover:bg-muted/30 transition-colors"
                        >
                            {/* Timestamp gutter */}
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground/40 group-hover:text-brand/60 transition-colors w-9 text-right tabular-nums leading-[1.6]">
                                {fmtTime(start)}
                            </span>
                            {/* Text */}
                            <p className="text-[13.5px] text-foreground/85 leading-[1.65] font-normal break-words flex-1 selection:bg-brand/30">
                                {rawText}
                            </p>
                        </div>
                    )
                }) : (
                    <div className="p-8 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Content Rescue Active</p>
                            <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[200px] mx-auto">
                                The full audio transcript was unavailable. We have rescued metadata and show notes to continue the analysis.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function RefineResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const segments = getArr(data, "segments")
    const count = segments.length || getNum(data, "segment_count", 0)

    if (compact) {
        return <Badge variant="secondary">{count} logical segments</Badge>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    {count} Logical Segments
                </Badge>
            </div>
            
            <div className="prose prose-invert prose-p:text-foreground/90 prose-p:leading-relaxed max-w-none">
                {segments.map((seg, i) => {
                    const s = seg as Record<string, unknown>
                    return (
                        <p key={i} className="my-6 first:mt-0 last:mb-0">
                            {normalizeText(getStr(s, "text"))}
                        </p>
                    )
                })}
            </div>
        </div>
    )
}

function SummaryResult({ data }: { data: Record<string, unknown> | string }) {
    const summary = normalizeText(typeof data === "string" ? data : getStr(data as Record<string, unknown>, "summary", ""))

    return (
                <ul className="space-y-4 list-none">
                    {summary.split("\n").map((line, i) => {
                        const trimmed = line.trim()
                        if (!trimmed && line === "") return <li key={i} className="h-2" />
                        if (trimmed.startsWith("# ")) return <li key={i} className="text-xl font-bold text-foreground mt-4 mb-3 font-serif tracking-tight border-b border-border/40 pb-1">{trimmed.slice(2)}</li>
                        if (trimmed.startsWith("## ")) return <li key={i} className="text-lg font-semibold text-foreground mt-4 mb-2 font-serif tracking-tight">{trimmed.slice(3)}</li>
                        if (trimmed.startsWith("### ")) return <li key={i} className="text-base font-semibold text-foreground mt-3 mb-2 font-serif">{trimmed.slice(4)}</li>
                        if (trimmed.startsWith("- ")) return <li key={i} className="text-sm text-muted-foreground ml-4 list-disc marker:text-brand/50 pl-1 my-1">{trimmed.slice(2)}</li>
                        if (trimmed.startsWith("> ")) return <li key={i} className="border-l-3 border-brand/30 pl-4 text-sm italic text-muted-foreground/80 my-3 bg-muted/20 py-2 rounded-lg">{trimmed.slice(2)}</li>
                        return <li key={i} className="text-sm text-muted-foreground leading-relaxed my-2">{trimmed}</li>
                    })}
                </ul>
    )
}

function PacketResult({ data }: { data: Record<string, unknown> }) {
    const sourceId = getStr(data, "source_id", "unknown")

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                Insight packet assembled for <span className="font-medium text-foreground">{sourceId}</span>.
                Transcript segments and metadata packaged and ready for LLM extraction.
            </p>
            <Badge variant="secondary">Ready for analysis</Badge>
        </div>
    )
}

function InsightsResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const d = (data.payload || data.data || data) as Record<string, unknown>
    const coreArgument = getStr(d, "core_argument")
    const keyClaims = getArr(d, "key_claims")
    const examples = getArr(d, "supporting_examples")
    const frameworks = getArr(d, "frameworks")
    const controversies = getArr(d, "controversies")
    const contradictions = getArr(d, "contradictions")
    const implications = getArr(d, "implications")
    const quotes = getArr(d, "memorable_quotes")
    
    // Check for is_rescued flag in d or data, or if status indicates a rescue/fallback
    // We refine this to only show if the transcript was actually rescued or unavailable
    const isRescued = d.is_rescued === true || data.is_rescued === true || d.status === "rescued" || data.status === "rescued" || d.status === "success_fallback" || data.status === "success_fallback"
    // NEW: Cross-reference with actual source status if available
    const trulyRescued = isRescued && (!d.core_argument || d.core_argument.toString().toLowerCase().includes("metadata"))

    if (compact) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Badge variant={isRescued ? "secondary" : "success"}>
                        {isRescued ? "Intelligence Extrapolated" : "Insights Extracted"}
                    </Badge>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">{coreArgument}</p>
                <p className="text-xs text-muted-foreground">{keyClaims.length} Claims • {examples.length} Examples</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Rescue Indicator */}
            {trulyRescued && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Rescued Intelligence</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            This analysis was extrapolated from source metadata and show notes because the full transcript was unavailable.
                        </p>
                    </div>
                </div>
            )}

            {/* Core Argument */}
            {coreArgument && (
                <div className="p-4 rounded-xl bg-brand/5 border border-brand/20">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand uppercase tracking-wider mb-2 font-serif">
                        <Lightbulb className="w-3.5 h-3.5" /> Core Argument
                    </div>
                    <p className="text-sm text-foreground leading-relaxed font-medium">{coreArgument}</p>
                </div>
            )}

            {/* Key Claims */}
            {keyClaims.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">
                        <Zap className="w-3.5 h-3.5 text-brand" /> Key Claims
                    </div>
                    <ul className="space-y-1.5">
                        {keyClaims.filter(claim => !shouldFilterInsight(String(claim))).map((claim, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                <span className="text-brand mt-0.5 shrink-0">•</span>
                                <span>{String(claim)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Supporting Examples */}
            {examples.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">
                        <Target className="w-3.5 h-3.5 text-emerald-500" /> Supporting Examples
                    </div>
                    <ul className="space-y-1.5">
                        {examples.filter(ex => !shouldFilterInsight(String(ex))).map((ex, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                <span className="text-emerald-500 mt-0.5 shrink-0">→</span>
                                <span>{String(ex)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Frameworks */}
            {!compact && frameworks.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">
                        <BookOpen className="w-3.5 h-3.5 text-blue-500" /> Frameworks
                    </div>
                    <div className="grid gap-2">
                        {frameworks.map((fw, i) => {
                            const f = fw as Record<string, unknown>
                            const title = getStr(f, "title")
                            const desc = getStr(f, "description")
                            if (shouldFilterInsight(title)) return null;
                            
                            return (
                                <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                    <p className="text-sm font-medium text-foreground">{title}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Quotes */}
            {!compact && quotes.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">
                        <MessageSquareQuote className="w-3.5 h-3.5 text-brand" /> Notable Quotes
                    </div>
                    {quotes.filter(q => !shouldFilterInsight(String(q))).map((q, i) => (
                        <blockquote key={i} className="border-l-2 border-brand/30 pl-3 text-sm text-muted-foreground italic">
                            &ldquo;{String(q)}&rdquo;
                        </blockquote>
                    ))}
                </div>
            )}

            {/* Controversies & Tensions */}
            {!compact && controversies.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">Controversies & Tensions</div>
                    <ul className="space-y-1">
                        {controversies.filter(c => !shouldFilterInsight(String(c))).map((c, i) => (
                            <li key={i} className="text-sm text-muted-foreground">? {String(c)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Contradictions */}
            {!compact && contradictions.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">Contradictions</div>
                    <ul className="space-y-1">
                        {contradictions.filter(c => !shouldFilterInsight(String(c))).map((c, i) => (
                            <li key={i} className="text-sm text-red-500/70 mb-1">! {String(c)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Implications */}
            {!compact && implications.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">Broader Implications</div>
                    <ul className="space-y-1.5">
                        {implications.filter(imp => !shouldFilterInsight(String(imp))).map((imp, i) => (
                            <li key={i} className="text-sm text-foreground/70 flex gap-2 items-start group/imp">
                                <span className="text-blue-500 mt-0.5 shrink-0 transition-transform group-hover/imp:scale-110">~</span>
                                <span>{String(imp)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function AngleResult({ data }: { data: Record<string, unknown> }) {
    const d = (data.payload || data.data || data) as Record<string, unknown>
    
    // ERROR GUARD: Handle failed status (e.g., Sparse Context)
    if (!d || d.status === "failed") {
        const error = (d?.error as string) || "Editorial Strategy Generation Failed"
        const isSparse = d?.error_code === "SPARSE_CONTEXT" || error.toLowerCase().includes("sparse")
        
        return (
            <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                    <Zap className={cn("w-5 h-5", isSparse ? "text-amber-500" : "text-red-500")} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">
                    {isSparse ? "Insufficient Source Depth" : "Generation Halted"}
                </h3>
                <p className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                    {isSparse 
                        ? "The source metadata is too thin for strategic analysis. Try a source with a full transcript or more detailed show notes." 
                        : error}
                </p>
            </div>
        )
    }

    const format = getStr(d, "content_type") || getStr(d, "recommended_format")
    const audience = getStr(d, "audience") || getStr(d, "target_audience")
    const tone = getStr(d, "tone")
    const goal = getStr(d, "goal") || getStr(d, "framing_angle")
    const readingLevel = getStr(d, "reading_level")
    const seoPriority = getStr(d, "seo_priority")
    const grounding = getStr(d, "source_grounding_mode")
    const mustInclude = getArr(d, "must_include")
    const avoidPatterns = getArr(d, "avoid_patterns")
    
    const titles = getArr(d, "working_titles")
    const rationale = getStr(d, "rationale")

    const displayFormat = format.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-brand/10 text-brand border-brand/20 flex items-center h-8 px-4 text-[13px] font-semibold">
                    {displayFormat || "Article"}
                </Badge>
                {audience && (
                    <Badge variant="outline" className="flex items-center h-8 px-4 text-[13px] text-muted-foreground/80 border-border/30">
                        {audience.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                )}
                {tone && (
                    <Badge variant="outline" className="flex items-center h-8 px-4 text-[13px] text-muted-foreground/80 border-border/30">
                        {tone.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                )}
                {seoPriority && (
                    <Badge variant="outline" className="flex items-center h-auto py-2 px-4 text-[13px] text-muted-foreground/80 border-border/30">
                        <span className="font-bold mr-1 shrink-0">SEO:</span> {seoPriority}
                    </Badge>
                )}
            </div>

            {goal && (
                <div>
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-1">Editorial Goal</div>
                    <p className="text-[13px] text-foreground/70 italic leading-relaxed">&ldquo;{goal}&rdquo;</p>
                </div>
            )}

            {grounding && (
                <div>
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-1">Source Grounding</div>
                    <div className="flex items-center gap-2">
                        <p className="text-[13px] text-foreground/70">{grounding}</p>
                    </div>
                </div>
            )}
            
            {readingLevel && (
                <div>
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-1">Reading Level</div>
                    <div className="flex items-center gap-2">
                        <p className="text-[13px] text-foreground/70">{readingLevel}</p>
                    </div>
                </div>
            )}

            {(mustInclude.length > 0 || avoidPatterns.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {mustInclude.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest font-serif">Must Include</div>
                            <ul className="space-y-1">
                                {mustInclude.map((item, i) => (
                                    <li key={i} className="text-[13px] text-muted-foreground flex gap-1.5 items-start">
                                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                                        <span className="leading-snug">{String(item)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {avoidPatterns.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-[11px] font-bold text-red-500/80 uppercase tracking-widest font-serif">Avoid Patterns</div>
                            <ul className="space-y-1">
                                {avoidPatterns.map((item, i) => (
                                    <li key={i} className="text-[13px] text-muted-foreground flex gap-1.5 items-start">
                                        <span className="text-red-500/80 mt-0.5 shrink-0">-</span>
                                        <span className="leading-snug">{String(item)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {titles.length > 0 && (
                <div className="pt-2">
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-2">Working Titles</div>
                    <div className="space-y-1.5">
                        {titles.map((t, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground/50 font-mono w-4">{i + 1}.</span>
                                <p className="text-sm text-foreground/70 font-medium">{String(t)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {rationale && (
                <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-3">{rationale}</p>
            )}
        </div>
    )
}



function DraftResult({ data, isGenerating = false, compact = false }: { data: Record<string, unknown>, isGenerating?: boolean, compact?: boolean }) {
    const [displayedContent, setDisplayedContent] = useState(() => {
        const d = (data?.result || data?.data || data) as Record<string, unknown>
        const text = typeof d === 'string' ? d : (getStr(d, "content") || getStr(d, "text") || "")
        return text
    })
    
    const d = (data?.result || data?.data || data) as Record<string, unknown>
    const fullText = typeof d === 'string' ? d : (getStr(d, "content") || getStr(d, "text") || "")
    const title = getStr(d, "title")
        // const wordCount = getNum(d, "word_count") // Removed to fix lint

    const stripHtml = (text: string) => {
        if (!text) return '';
        return text
            .replace(/<[^>]*>?/gm, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    };

    const cleanTitle = stripHtml(title || "");
    
    useEffect(() => {
        if (!isGenerating) return;
        const words = fullText.split(" ")
        const displayedWords = displayedContent.split(" ")
        
        if (words.length > displayedWords.length) {
            const nextWord = words[displayedWords.length]
            const timeout = setTimeout(() => {
                setDisplayedContent((prev: string) => prev + (prev ? " " : "") + nextWord)
            }, 30)
            return () => clearTimeout(timeout)
        }
    }, [fullText, isGenerating, displayedContent])

    if (!data) return <div className="p-8 text-center text-muted-foreground italic">No available draft.</div>

    const contentToDisplay = isGenerating ? displayedContent : fullText;
    const blocks = contentToDisplay.split(/\n\n|\n(?=[A-Z][^:]+: [A-Z])/);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-20 lg:pb-0">
            {cleanTitle && !compact && (
                <div className="border-b border-border/40 pb-4 mb-2">
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight leading-tight">
                        {cleanTitle}
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="success" className="bg-brand/10 text-brand border-brand/20">Draft Article</Badge>
                        {isGenerating && <span className="text-xs text-brand animate-pulse">Drafting...</span>}
                    </div>
                </div>
            )}
            
            <div className="prose prose-invert max-w-none prose-p:text-foreground/90 prose-p:leading-relaxed prose-headings:font-serif prose-headings:text-white relative">
                {blocks.map((line: string, i: number) => {
                    const originalTrimmed = line.trim()
                    const trimmed = stripHtml(originalTrimmed)
                    if (!trimmed) return null

                    const labelHeaderMatch = originalTrimmed.match(/^([A-Z][A-Za-z\s]+): ([A-Z].+)$/)
                    
                    const cleanLine = trimmed.replace(/^#+\s+/, '').replace(/^title:\s*/i, '').trim();
                    if (i === 0 && (cleanLine.toLowerCase() === cleanTitle.toLowerCase() || cleanLine.toLowerCase() === stripHtml(title || "").replace(/^#+\s+/, '').toLowerCase().trim())) {
                        return null
                    }

                    if (originalTrimmed.startsWith("# ")) {
                        return (
                            <h1 key={i} className="text-2xl font-bold text-foreground mt-8 mb-4 font-serif tracking-tight border-b-2 border-brand/20 pb-2">
                                {stripHtml(originalTrimmed.slice(2))}
                            </h1>
                        )
                    }
                    if (originalTrimmed.startsWith("## ")) {
                        return (
                            <h2 key={i} className="text-xl font-bold text-white mt-7 mb-3 font-serif tracking-tight border-b border-border/40 pb-1">
                                {stripHtml(originalTrimmed.slice(3))}
                            </h2>
                        )
                    }
                    if (originalTrimmed.startsWith("### ")) {
                        return (
                            <h3 key={i} className="text-lg font-bold text-white mt-6 mb-2 font-serif tracking-tight">
                                {stripHtml(originalTrimmed.slice(4))}
                            </h3>
                        )
                    }
                    if (labelHeaderMatch) {
                        return (
                            <div key={i} className="mt-8 mb-4">
                                <h3 className="text-lg font-bold text-white font-serif tracking-tight border-l-4 border-brand pl-4 py-1 rounded-r-lg">
                                    <span className="text-brand/60 text-xs font-sans uppercase tracking-[0.2em] block mb-0.5">{labelHeaderMatch[1]}</span>
                                    {labelHeaderMatch[2]}
                                </h3>
                            </div>
                        )
                    }

                    
                    const isLastLine = i === blocks.length - 1
                    
                    return (
                        <div key={i} className="mb-4 relative">
                            <p className="m-0">{trimmed}</p>
                            {isLastLine && isGenerating && (
                                <span className="inline-block w-1 h-4 bg-brand ml-1 animate-pulse" />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function GenericResult({ data }: { data: Record<string, unknown> }) {
    const status = getStr(data, "status")
    const message = getStr(data, "message")

    return (
        <div className="space-y-2">
            {status && <Badge variant={status === "success" || status === "done" ? "success" : "secondary"}>{status}</Badge>}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            {!status && !message && (
                <p className="text-sm text-muted-foreground italic">Stage completed successfully.</p>
            )}

            {/* Fallback to show raw data if no specific status/message is provided but data exists */}
            {!status && !message && Object.keys(data).length > 0 && typeof data === 'object' && (
                <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/40 overflow-x-auto">
                    <pre className="text-[10px] sm:text-xs text-muted-foreground font-mono leading-relaxed">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    )
}

function VisualResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const suggestions = getArr(data, "visual_suggestions") || []
    const note = getStr(data, "note")
    
    if (compact) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Badge variant="secondary">{suggestions.length} Hooks Planned</Badge>
                </div>
                <p className="text-xs text-muted-foreground italic">{note || "Visual automation pending."}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
                The **Visual Curator** has analyzed your draft and prepared suggested AI prompts for your visuals. Use these descriptions to generate high-impact graphics for your final write-up.
            </p>
            <div className="grid gap-3">
                {suggestions.map((s, i) => {
                    const sg = s as Record<string, unknown>
                    const type = getStr(sg, "type").replace("_", " ").toUpperCase()
                    const desc = getStr(sg, "description")
                    const engine = getStr(sg, "engine") || "dalle-3"
                    const reasoning = getStr(sg, "reasoning")
                    const prompt = getStr(sg, "prompt")
                    
                    const isNano = engine === "nano-banana"

                    return (
                        <div key={i} className="p-4 rounded-xl border border-border/50 bg-muted/20 relative overflow-hidden group transition-all hover:bg-muted/30">
                            <div className={cn(
                                "absolute top-0 left-0 w-1 h-full",
                                isNano ? "bg-amber-500/50" : "bg-brand/50"
                            )} />
                            <div className="pl-2 space-y-2">
                                <div className="flex items-center justify-between gap-4">
                                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60">{type}</p>
                                    <Badge 
                                        variant="secondary" 
                                        className={cn(
                                            "font-mono text-[9px] uppercase tracking-wider",
                                            isNano ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-brand/10 text-brand border-brand/20"
                                        )}
                                    >
                                        {String(engine)}
                                    </Badge>
                                </div>
                                <p className="text-sm font-semibold text-foreground">{String(desc)}</p>
                                
                                {Boolean(sg.image_url) && (
                                    <div className="mt-4 rounded-lg overflow-hidden border border-border/40 shadow-sm transition-transform hover:scale-[1.01] relative aspect-video">
                                        <Image 
                                            src={String(sg.image_url)} 
                                            alt={String(desc)}
                                            fill
                                            className="object-cover"
                                            unoptimized // Since these might be external AI generated URLs
                                        />
                                    </div>
                                )}

                                {reasoning && (
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        <span className="text-foreground/40 italic">Logic:</span> {String(reasoning)}
                                    </p>
                                )}

                                {prompt && !compact && (
                                    <div className="mt-3 p-2 rounded-lg bg-black/20 border border-white/5 text-[10px] text-muted-foreground/80 font-mono leading-tight">
                                        {prompt}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
            {note && (
                <p className="text-xs text-muted-foreground/60 italic pt-2">{note}</p>
            )}
        </div>
    )
}
 
function SocialiseResult({ data, sourceId }: { data: Record<string, unknown>; sourceId?: string }) {
    // Aggressive normalization: catch nested result/data/payload structures
    const d = (data.result || data.data || data.payload || data) as Record<string, unknown>
    const hook = getStr(d, "hook")
    const thread = getArr(d, "thread")
    const cta = getStr(d, "cta")

    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
    const [isPublishing, setIsPublishing] = useState(false)
    const [publishResult, setPublishResult] = useState<{ success: boolean; message: string; url?: string } | null>(null)

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    const handlePublish = async (platformId: string) => {
        if (platformId !== 'x') {
            alert(`Publishing to ${platformId} is coming soon!`)
            return
        }
        if (!sourceId) return
        setIsPublishing(true)
        setPublishResult(null)

        try {
            const res = await fetch("/api/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceId,
                    platform: "twitter", // Assuming 'x' maps to 'twitter' for the backend
                    content: { hook, thread, cta }
                })
            })

            const result = await res.json()
            if (res.ok) {
                const tweetId = result.result?.tweet_ids?.[0]
                const url = tweetId ? `https://x.com/i/status/${tweetId}` : "https://x.com"
                setPublishResult({ success: true, message: "Thread published to X!", url })
            } else {
                setPublishResult({ success: false, message: result.error || "Publishing failed" })
            }
        } catch {
            setPublishResult({ success: false, message: "Network error during publishing" })
        } finally {
            setIsPublishing(false)
        }
    }

    const allTweets = [hook, ...thread, cta].filter(Boolean)

    if (allTweets.length === 0) {
        return <div className="p-4 text-xs text-muted-foreground italic">No thread content generated yet.</div>
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-1 rounded-2xl border border-border/40 overflow-visible relative z-30">
                <div className="p-4 space-y-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <ShareIcon className="w-4 h-4 text-brand" />
                        Threads
                    </p>
                    <p className="text-xs text-muted-foreground">Ready for distribution</p>
                </div>
                {sourceId && (
                    <div className="w-full sm:w-auto p-1 pr-6 flex justify-end">
                        <PublishDropdown 
                            type="mission_control"
                            onPublish={handlePublish}
                            isPublishing={isPublishing}
                        />
                    </div>
                )}
            </div>

            {publishResult && (
                <div className={cn(
                    "p-4 rounded-xl text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2",
                    publishResult.success ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                )}>
                    <div className="flex items-center gap-3 font-medium">
                        {publishResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        {publishResult.message}
                    </div>
                    {publishResult.success && (
                        <button 
                            onClick={() => window.open(publishResult.url || 'https://x.com', '_blank')}
                            className="text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 shrink-0"
                        >
                            View on X <Send className="w-2.5 h-2.5" />
                        </button>
                    )}
                </div>
            )}

            <div className="space-y-4 relative before:absolute before:left-6 before:top-8 before:bottom-8 before:w-0.5 before:bg-border/30">
                {allTweets.map((tweet, i) => (
                    <div key={i} className="relative pl-12 group">
                        {/* Thread Circle */}
                        <div className="absolute left-4 top-1 w-4 h-4 rounded-full border-2 border-brand bg-background z-10" />
                        
                        <div className="p-4 rounded-xl border border-border/50 hover:bg-muted/10 transition-all relative">
                            <div className="flex justify-between items-start gap-4 mb-2">
                                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                                    {i === 0 ? "The Hook" : i === allTweets.length - 1 ? "The Conclusion" : `Post ${i + 1}`}
                                </span>
                                <button 
                                    onClick={() => copyToClipboard(String(tweet), i)}
                                    className="p-1.5 rounded-md hover:bg-background/50 text-muted-foreground transition-colors"
                                    title="Copy content"
                                >
                                    {copiedIndex === i ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                                {String(tweet)}
                            </p>
                            <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground/40 font-mono">
                                <span>{String(tweet).length}/280 characters</span>
                                {String(tweet).length > 280 && (
                                    <span className="text-red-500/60 font-bold uppercase tracking-tighter animate-pulse">Exceeds Limit</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function QaResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const dqmData = ((data?.result || data?.payload || data?.data || data) as unknown) as (DQMData & { total_score?: number; score?: number; dqmScore?: number; publishability?: number; scores?: any })
    if (!dqmData) return <div className="p-4 text-xs text-muted-foreground italic">Matrix analysis pending...</div>
    const pubScore = dqmData?.scores?.publishability ?? dqmData?.scores?.total_score ?? dqmData?.total_score ?? dqmData?.publishability ?? dqmData?.score ?? dqmData?.dqmScore ?? 0
    const normalizedScore = pubScore > 10 ? pubScore : pubScore * 10
    
    if (compact) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-serif">{pubScore}{pubScore > 10 ? "/100" : "/10"}</span>
                <Badge variant={normalizedScore >= 80 ? "success" : normalizedScore >= 60 ? "warning" : "destructive"}>
                     {pubScore > 0 ? (normalizedScore >= 80 ? "Exceptional" : normalizedScore >= 60 ? "Solid" : "Low score") : "Pending"}
                </Badge>

                </div>
            </div>
        )
    }

    return (
        <div className="pb-10">
            <DQMCard dqm={dqmData} variant="full" />
        </div>
    )
}

// ─── Main Component ────────────────────────────────────────────

export function StageResultView({ stageId, data, sourceId, compact = false }: StageResultViewProps) {
    const d = (typeof data === 'string' ? data : data as Record<string, unknown>) || {}

    const isFallback = typeof d === 'object' && d !== null && d.status === "Stage complete" && typeof d.message === "string";
    if (isFallback) {
        return <GenericResult data={d as Record<string, unknown>} />
    }

    switch (stageId) {
        case "judge":
            return <JudgeResult data={d as Record<string, unknown>} compact={compact} />
        case "transcript":
            return <TranscriptResult data={d as Record<string, unknown>} compact={compact} />
        case "refine":
            return <RefineResult data={d as Record<string, unknown>} compact={compact} />
        case "summary":
            return <SummaryResult data={d as Record<string, unknown>} />
        case "packet":
            return <PacketResult data={d as Record<string, unknown>} />
        case "insights":
            return <InsightsResult data={d as Record<string, unknown>} compact={compact} />
        case "angle":
            return <AngleResult data={d as Record<string, unknown>} />
        case "draft":
            return <DraftResult data={d as Record<string, unknown>} isGenerating={false} compact={compact} />
        case "visual":
            return <VisualResult data={d as Record<string, unknown>} compact={compact} />
        case "qa":
            return <QaResult data={d as Record<string, unknown>} compact={compact} />
        case "socialise":
            return <SocialiseResult data={d as Record<string, unknown>} sourceId={sourceId} />
        default:
            return <GenericResult data={typeof d === 'string' ? { message: d } : (d as Record<string, unknown>)} />
    }
}


// Export for use in Inspect panel with full detail
export function StageResultPanel({ stageId, data, sourceId }: { stageId: StageId; data: Record<string, unknown>; sourceId?: string }) {
    const d = data?.result || data?.payload || data?.data || data;
    const wordCount = stageId === "draft" && d
        ? (getNum(d as Record<string, unknown>, "word_count") || 
           getStr(d as Record<string, unknown>, "content", "").trim().split(/\s+/).filter(Boolean).length) 
        : null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-brand" />
                    <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">Engine Output</span>
                </div>
                {wordCount !== null && (
                    <Badge variant="success" className="font-sans">{wordCount} words</Badge>
                )}
            </div>
            <StageResultView stageId={stageId} data={data} sourceId={sourceId} compact={false} />
        </div>
    )
}
