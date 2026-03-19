import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { BarChart3, BookOpen, Lightbulb, MessageSquareQuote, Target, Zap } from "lucide-react"
import DQMCard, { DQMData } from "./DQMCard"

type StageId = "judge" | "transcript" | "refine" | "summary" | "packet" | "insights" | "angle" | "draft" | "visual" | "qa" | "export"

interface StageResultViewProps {
    stageId: StageId
    data: Record<string, unknown> | string
    compact?: boolean // for accordion vs full panel
}


// Helper to safely access nested data
function get(obj: Record<string, unknown>, key: string, fallback: unknown = ""): unknown {
    if (obj[key] !== undefined) return obj[key]
    // Check nested "payload" (common in our adapters)
    const payload = obj.payload as Record<string, unknown> | undefined
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
    const status = getStr(data, "status")
    const isRescued = status === "rescued_text"

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={isRescued ? "secondary" : "secondary"}>
                    {segmentCount} {isRescued ? "content block" : "segments"} retrieved
                </Badge>
                {isRescued && (
                    <Badge variant="success" className="bg-brand/10 text-brand border-brand/20">
                        Rescued from Metadata
                    </Badge>
                )}
            </div>
            
            {isRescued && !compact && (
                <div className="p-4 rounded-xl bg-muted/30 border border-brand/10 text-xs text-muted-foreground leading-relaxed italic">
                    Note: Audio transcription was unavailable. Distill rescued this content from source metadata and show notes to maintain pipeline continuity.
                </div>
            )}

            {!compact && segments.length > 0 && (
                <div className="space-y-2 pr-2 pb-6">
                    {segments.map((seg, i) => {
                        const s = seg as Record<string, unknown>
                        const hasTime = typeof s.start === "number" && s.start > 0
                        return (
                            <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                                {hasTime && (
                                    <span className="text-[10px] font-mono text-muted-foreground/60 block mb-1">
                                        {`${Math.floor((s.start as number) / 60)}:${String(Math.floor((s.start as number) % 60)).padStart(2, "0")}`}
                                    </span>
                                )}
                                <p className={cn(
                                    "text-xs text-foreground leading-relaxed",
                                    isRescued ? "text-sm" : ""
                                )}>
                                    {getStr(s, "text")}
                                </p>
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
                <div className="space-y-3 pb-6">
                    {segments.map((seg, i) => {
                        const s = seg as Record<string, unknown>
                        return (
                            <div key={i} className="p-4 rounded-lg bg-muted/40 border border-border/40">
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{getStr(s, "text")}</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function SummaryResult({ data }: { data: Record<string, unknown> | string }) {
    const summary = typeof data === "string" ? data : getStr(data as Record<string, unknown>, "summary", "")

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

    if (compact) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Badge variant="success">Insights Extracted</Badge>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">{coreArgument}</p>
                <p className="text-xs text-muted-foreground">{keyClaims.length} Claims • {examples.length} Examples</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
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
                        {keyClaims.map((claim, i) => (
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
                        {examples.map((ex, i) => (
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
                    <div className="flex items-center gap-2 text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">
                        <MessageSquareQuote className="w-3.5 h-3.5 text-brand" /> Notable Quotes
                    </div>
                    {quotes.map((q, i) => (
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
                        {controversies.map((c, i) => (
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
                        {contradictions.map((c, i) => (
                            <li key={i} className="text-sm text-red-500/70">! {String(c)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Implications */}
            {!compact && implications.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif">Broader Implications</div>
                    <ul className="space-y-1.5">
                        {implications.map((imp, i) => (
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
    const format = getStr(d, "recommended_format")
    const secondaryFormats = getArr(d, "secondary_formats")
    const audience = getStr(d, "target_audience")
    const framing = getStr(d, "framing_angle")
    const titles = getArr(d, "working_titles")
    const rationale = getStr(d, "rationale")

    const displayFormat = format.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-brand/10 text-brand border-brand/20">{displayFormat}</Badge>
                {secondaryFormats.map((f, i) => (
                    <Badge key={i} variant="secondary">{String(f).replace(/_/g, " ")}</Badge>
                ))}
            </div>

            {framing && (
                <div>
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-1">Framing Angle</div>
                    <p className="text-sm text-foreground/70 italic leading-relaxed">&ldquo;{framing}&rdquo;</p>
                </div>
            )}

            {audience && (
                <div>
                    <div className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest font-serif mb-1">Target Audience</div>
                    <p className="text-sm text-foreground/70">{audience}</p>
                </div>
            )}

            {titles.length > 0 && (
                <div>
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



function DraftResult({ data, isGenerating }: { data: any, isGenerating: boolean }) {
    const [displayedContent, setDisplayedContent] = useState("")
    
    // Support both structured data from generate API and raw results from other stages
    const d = (data?.result || data?.data || data) as any
    const fullText = typeof d === 'string' ? d : (d?.content || d?.text || "")
    const title = d?.title || ""
    const wordCount = d?.word_count || 0
    
    useEffect(() => {
        if (!isGenerating) {
            setDisplayedContent(fullText)
            return
        }

        // If we are generating, catch up to current fullText but don't reset everything
        // We'll use a simpler interval that just adds words as they arrive if needed
        // but for high-fidelity we want a smooth rhythm
        const words = fullText.split(" ")
        const displayedWords = displayedContent.split(" ")
        
        if (words.length > displayedWords.length) {
            const nextWord = words[displayedWords.length]
            const timeout = setTimeout(() => {
                setDisplayedContent(prev => prev + (prev ? " " : "") + nextWord)
            }, 30)
            return () => clearTimeout(timeout)
        }
    }, [fullText, isGenerating, displayedContent])

    if (!data) return null

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
            {title && (
                <div className="border-b border-border/40 pb-4 mb-2">
                    <h1 className="text-2xl font-bold text-foreground font-serif tracking-tight leading-tight">
                        {title}
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant="success" className="bg-brand/10 text-brand border-brand/20">Draft Article</Badge>
                        {wordCount > 0 && <span className="text-xs text-muted-foreground font-medium">{wordCount} words</span>}
                        {isGenerating && <span className="text-xs text-brand animate-pulse">Drafting...</span>}
                    </div>
                </div>
            )}
            
            <div className="prose prose-invert max-w-none prose-p:text-foreground/90 prose-p:leading-relaxed prose-headings:font-serif prose-headings:text-white relative">
                {displayedContent.split("\n\n").map((line, i) => {
                    const trimmed = line.trim()
                    if (!trimmed) return null
                    
                    const isLastLine = i === displayedContent.split("\n\n").length - 1
                    
                    return (
                        <div key={i} className="mb-4 relative">
                            {trimmed.startsWith("# ") ? (
                                <h1 className="text-2xl font-bold text-foreground mt-8 mb-4 font-serif tracking-tight border-b-2 border-brand/20 pb-2">
                                    {trimmed.slice(2)}
                                </h1>
                            ) : trimmed.startsWith("## ") ? (
                                <h2 className="text-xl font-bold text-white mt-7 mb-3 font-serif tracking-tight border-b border-border/40 pb-1">
                                    {trimmed.slice(3)}
                                </h2>
                            ) : trimmed.startsWith("### ") ? (
                                <h3 className="text-lg font-bold text-white mt-6 mb-2 font-serif tracking-tight">
                                    {trimmed.slice(4)}
                                </h3>
                            ) : trimmed.startsWith("- ") ? (
                                <ul className="list-disc ml-6 my-2">
                                    <li className="text-sm text-foreground/90 marker:text-brand/50 pl-1">{trimmed.slice(2)}</li>
                                </ul>
                            ) : (
                                <p className="text-base leading-relaxed">{trimmed}</p>
                            )}
                            
                            {isGenerating && isLastLine && (
                                <span className="inline-block w-2 h-5 bg-brand/60 ml-1 animate-pulse align-middle" />
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
                The visual planner has scanned the draft and determined optimal breakpoints for visual hooks. 
            </p>
            <div className="space-y-3">
                {suggestions.map((s, i) => {
                    const sg = s as Record<string, unknown>
                    const type = getStr(sg, "type").replace("_", " ").toUpperCase()
                    const desc = getStr(sg, "description")
                    return (
                        <div key={i} className="p-3 rounded-xl border border-border/50 bg-muted/20 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30" />
                            <div className="pl-2">
                                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 mb-1">{type}</p>
                                <p className="text-sm font-medium text-foreground">{String(desc)}</p>
                                {!!sg.content && (
                                    <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-border/50 pl-2">
                                        &quot;{String(sg.content)}&quot;
                                    </p>
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

function QaResult({ data, compact }: { data: Record<string, unknown>; compact?: boolean }) {
    const dqmData = ((data.result || data.payload || data.data || data) as unknown) as DQMData
    
    if (compact) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-serif">{(dqmData?.scores?.publishability) || 0}/100</span>
                <Badge variant={((dqmData?.scores?.publishability as number) || 0) >= 80 ? "success" : "secondary"}>
                    {dqmData?.scores?.publishability ? "Available" : "Pending"}
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

export function StageResultView({ stageId, data, compact = false }: StageResultViewProps) {
    const d = (typeof data === 'string' ? data : data as Record<string, unknown>) || {}


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
            return <DraftResult data={d as Record<string, unknown>} compact={compact} />
        case "visual":
            return <VisualResult data={d as Record<string, unknown>} compact={compact} />
        case "qa":
            return <QaResult data={d as Record<string, unknown>} compact={compact} />
        default:
            return <GenericResult data={typeof d === 'string' ? { message: d } : (d as Record<string, unknown>)} />
    }
}


// Export for use in Inspect panel with full detail
export function StageResultPanel({ stageId, data }: { stageId: StageId; data: Record<string, unknown> }) {
    const wordCount = stageId === "draft" ? getNum((data.data as Record<string, unknown>) || data, "word_count") : null;

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
            <StageResultView stageId={stageId} data={data} compact={false} />
        </div>
    )
}
