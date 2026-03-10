"use client"

import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { BarChart3, BookOpen, Lightbulb, MessageSquareQuote, Target, Zap } from "lucide-react"

type StageId = "judge" | "transcript" | "refine" | "packet" | "insights" | "angle" | "draft" | "visual" | "qa" | "export"

interface StageResultViewProps {
    stageId: StageId
    data: Record<string, unknown>
    compact?: boolean // for accordion vs full panel
}

// Helper to safely access nested data
function get(obj: Record<string, unknown>, key: string, fallback: unknown = ""): unknown {
    if (obj[key] !== undefined) return obj[key]
    // Check nested "data" field (common in API responses)
    const data = obj.data as Record<string, unknown> | undefined
    if (data && data[key] !== undefined) return data[key]
    return fallback
}

function getStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
    const val = get(obj, key, fallback)
    return typeof val === "string" ? val : String(val || fallback)
}

function getArr(obj: Record<string, unknown>, key: string): unknown[] {
    const val = get(obj, key, [])
    return Array.isArray(val) ? val : []
}

function getNum(obj: Record<string, unknown>, key: string, fallback = 0): number {
    const val = get(obj, key, fallback)
    return typeof val === "number" ? val : fallback
}

// ─── Per-Stage Renderers ────────────────────────────────────────

function JudgeResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const score = getNum(data, "score")
    const status = getStr(data, "status")
    const rationale = getStr(data, "rationale", "Source evaluated based on NorthStar alignment criteria.")

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className={cn(
                    "text-2xl font-bold tabular-nums",
                    score >= 8 ? "text-emerald-600" : score >= 6 ? "text-amber-600" : "text-red-500"
                )}>
                    {score}/10
                </div>
                <Badge variant={status === "done" ? "success" : "secondary"}>
                    {score >= 8 ? "High Signal" : score >= 6 ? "Moderate Signal" : "Low Signal"}
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

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <Badge variant="secondary">{segmentCount} segments retrieved</Badge>
            </div>
            {!compact && segments.length > 0 && (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 pb-6">
                    {segments.map((seg, i) => {
                        const s = seg as Record<string, unknown>
                        return (
                            <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                <span className="text-[10px] font-mono text-muted-foreground/60 block mb-1">
                                    {typeof s.start === "number" ? `${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, "0")}` : ""}
                                </span>
                                <p className="text-xs text-foreground leading-relaxed">{getStr(s, "text")}</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function RefineResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const segments = getArr(data, "segments")
    const count = segments.length || getNum(data, "segment_count", 0)

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Transcript cleaned and structured into <span className="font-semibold text-foreground">{count} logical segments</span>.
                Noise artifacts, filler words, and system tags removed.
            </p>
            {!compact && segments.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {segments.slice(0, 3).map((seg, i) => {
                        const s = seg as Record<string, unknown>
                        return (
                            <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                <p className="text-xs text-foreground leading-relaxed">{getStr(s, "text").slice(0, 200)}...</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function PacketResult({ data }: { data: Record<string, unknown> }) {
    const videoId = getStr(data, "video_id", "unknown")

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                Insight packet assembled for <span className="font-medium text-foreground">{videoId}</span>.
                Transcript segments and metadata packaged and ready for LLM extraction.
            </p>
            <Badge variant="secondary">Ready for analysis</Badge>
        </div>
    )
}

function InsightsResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const d = (data.data || data) as Record<string, unknown>
    const thesis = getStr(d, "thesis")
    const keyIdeas = getArr(d, "key_ideas")
    const frameworks = getArr(d, "frameworks")
    const quotes = getArr(d, "quotes")
    const takeaways = getArr(d, "takeaways")
    const tensions = getArr(d, "tensions")
    const confidence = getStr(d, "confidence_notes")

    return (
        <div className="space-y-5">
            {/* Thesis */}
            {thesis && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">
                        <Lightbulb className="w-3.5 h-3.5" /> Core Thesis
                    </div>
                    <p className="text-sm text-foreground leading-relaxed font-medium">{thesis}</p>
                </div>
            )}

            {/* Key Ideas */}
            {keyIdeas.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">
                        <Zap className="w-3.5 h-3.5" /> Key Ideas
                    </div>
                    <ul className="space-y-1.5">
                        {keyIdeas.map((idea, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                <span className="text-brand mt-0.5 shrink-0">•</span>
                                <span>{String(idea)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Frameworks */}
            {!compact && frameworks.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">
                        <BookOpen className="w-3.5 h-3.5" /> Frameworks
                    </div>
                    <div className="grid gap-2">
                        {frameworks.map((fw, i) => {
                            const f = fw as Record<string, unknown>
                            return (
                                <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                    <p className="text-sm font-medium text-foreground">{getStr(f, "title")}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{getStr(f, "description")}</p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Quotes */}
            {!compact && quotes.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">
                        <MessageSquareQuote className="w-3.5 h-3.5" /> Notable Quotes
                    </div>
                    {quotes.map((q, i) => (
                        <blockquote key={i} className="border-l-2 border-brand/30 pl-3 text-sm text-muted-foreground italic">
                            &ldquo;{String(q)}&rdquo;
                        </blockquote>
                    ))}
                </div>
            )}

            {/* Takeaways */}
            {takeaways.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">
                        <Target className="w-3.5 h-3.5" /> Builder Takeaways
                    </div>
                    <ul className="space-y-1.5">
                        {takeaways.map((t, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2 items-start">
                                <span className="text-emerald-500 mt-0.5 shrink-0">→</span>
                                <span>{String(t)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tensions */}
            {!compact && tensions.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">Open Questions</div>
                    <ul className="space-y-1">
                        {tensions.map((t, i) => (
                            <li key={i} className="text-sm text-muted-foreground">? {String(t)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Confidence */}
            {!compact && confidence && (
                <p className="text-xs text-muted-foreground/70 italic border-t border-border/30 pt-3">
                    {confidence}
                </p>
            )}
        </div>
    )
}

function AngleResult({ data }: { data: Record<string, unknown> }) {
    const d = (data.data || data) as Record<string, unknown>
    const format = getStr(d, "recommended_format")
    const secondaryFormats = getArr(d, "secondary_formats")
    const audience = getStr(d, "target_audience")
    const framing = getStr(d, "framing_angle")
    const titles = getArr(d, "working_titles")
    const rationale = getStr(d, "rationale")

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Badge>{format}</Badge>
                {secondaryFormats.map((f, i) => (
                    <Badge key={i} variant="secondary">{String(f)}</Badge>
                ))}
            </div>

            {framing && (
                <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 font-serif">Framing Angle</p>
                    <p className="text-sm text-foreground font-medium">{framing}</p>
                </div>
            )}

            {audience && (
                <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 font-serif">Target Audience</p>
                    <p className="text-sm text-muted-foreground">{audience}</p>
                </div>
            )}

            {titles.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-serif">Working Titles</p>
                    <div className="space-y-1.5">
                        {titles.map((t, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground/50 font-mono w-4">{i + 1}.</span>
                                <p className="text-sm text-foreground font-medium">{String(t)}</p>
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

function DraftResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const d = (data.data || data) as Record<string, unknown>
    const title = getStr(d, "title")
    const content = getStr(d, "content")
    const wordCount = getNum(d, "word_count")

    if (compact) {
        return (
            <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <div className="flex items-center gap-2">
                    <Badge variant="success">Draft Complete</Badge>
                    <span className="text-xs text-muted-foreground">{wordCount} words</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{content.replace(/[#*]/g, "").slice(0, 200)}...</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="prose prose-sm max-w-none text-muted-foreground font-serif">
                {content.split("\n").map((line, i) => {
                    if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-bold text-foreground mt-4 mb-2 font-serif">{line.slice(2)}</h1>
                    if (line.startsWith("## ")) return <h2 key={i} className="text-base font-semibold text-foreground mt-4 mb-1.5 font-serif">{line.slice(3)}</h2>
                    if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1 font-serif">{line.slice(4)}</h3>
                    if (line.startsWith("- ")) return <ul key={i}><li className="text-sm text-muted-foreground ml-4">{line.slice(2)}</li></ul>
                    if (line.startsWith("> ")) return <blockquote key={i} className="border-l-2 border-brand/30 pl-3 text-sm italic text-muted-foreground my-2">{line.slice(2)}</blockquote>
                    if (line.trim() === "") return <br key={i} />
                    return <p key={i} className="text-sm text-muted-foreground leading-relaxed my-1.5">{line}</p>
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

// ─── Main Component ────────────────────────────────────────────

export function StageResultView({ stageId, data, compact = false }: StageResultViewProps) {
    const d = data as Record<string, unknown>

    switch (stageId) {
        case "judge":
            return <JudgeResult data={d} compact={compact} />
        case "transcript":
            return <TranscriptResult data={d} compact={compact} />
        case "refine":
            return <RefineResult data={d} compact={compact} />
        case "packet":
            return <PacketResult data={d} />
        case "insights":
            return <InsightsResult data={d} compact={compact} />
        case "angle":
            return <AngleResult data={d} />
        case "draft":
            return <DraftResult data={d} compact={compact} />
        default:
            return <GenericResult data={d as Record<string, unknown>} />
    }
}

// Export for use in Inspect panel with full detail
export function StageResultPanel({ stageId, data }: { stageId: StageId; data: Record<string, unknown> }) {
    const wordCount = stageId === "draft" ? getNum(data.data || data, "word_count") : null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-serif">Engine Output</span>
                </div>
                {wordCount !== null && (
                    <Badge variant="success" className="font-sans">{wordCount} words</Badge>
                )}
            </div>
            <StageResultView stageId={stageId} data={data} compact={false} />
        </div>
    )
}
