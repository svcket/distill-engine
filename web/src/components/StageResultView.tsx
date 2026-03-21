import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { Loader2, AlertCircle, CheckCircle2, FileText, FastForward, Cpu, Target, PenTool, Layout, Box, Share2 as ShareIcon, Copy, Check, Download, Lightbulb, Zap, BookOpen, MessageSquareQuote, BarChart3, ChevronDown, ChevronUp } from "lucide-react"
import DQMCard, { DQMData } from "./DQMCard"

type StageId = "judge" | "transcript" | "refine" | "summary" | "packet" | "insights" | "angle" | "draft" | "visual" | "qa" | "socialise" | "export"

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
                <Badge className="bg-brand/10 text-brand border-brand/20 flex items-center gap-1.5">
                    {displayFormat}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                </Badge>
                {secondaryFormats.map((f, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1.5">
                        {String(f).replace(/_/g, " ")}
                        <ChevronDown className="w-3 h-3 opacity-40" />
                    </Badge>
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
                    <div className="flex items-center gap-2">
                        <p className="text-sm text-foreground/70">{audience}</p>
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
                    </div>
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



function DraftResult({ data, isGenerating = false, compact = false }: { data: Record<string, unknown>, isGenerating?: boolean, compact?: boolean }) {
    const [displayedContent, setDisplayedContent] = useState(() => {
        const d = (data?.result || data?.data || data) as Record<string, unknown>
        const text = typeof d === 'string' ? d : (getStr(d, "content") || getStr(d, "text") || "")
        return text
    })
    
    const d = (data?.result || data?.data || data) as Record<string, unknown>
    const fullText = typeof d === 'string' ? d : (getStr(d, "content") || getStr(d, "text") || "")
    const title = getStr(d, "title")
    const wordCount = getNum(d, "word_count")

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

    if (!data) return <div className="p-8 text-center text-muted-foreground italic">No draft content available.</div>

    const contentToDisplay = isGenerating ? displayedContent : fullText;
    const blocks = contentToDisplay.split(/\n\n|\n(?=[A-Z][^:]+: [A-Z])/);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
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
                                    <div className="mt-4 rounded-lg overflow-hidden border border-border/40 shadow-sm transition-transform hover:scale-[1.01]">
                                        <img 
                                            src={String(sg.image_url)} 
                                            alt={String(desc)}
                                            className="w-full h-auto object-cover max-h-[400px]"
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
 
function SocialiseResult({ data }: { data: Record<string, unknown> }) {
    const d = (data.result || data.data || data) as Record<string, unknown>
    const hook = getStr(d, "hook")
    const thread = getArr(d, "thread")
    const cta = getStr(d, "cta")

    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    const allTweets = [hook, ...thread, cta].filter(Boolean)

    if (allTweets.length === 0) {
        return <div className="p-4 text-xs text-muted-foreground italic">No thread content generated yet.</div>
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">X (Twitter) Thread</p>
                    <p className="text-xs text-muted-foreground lowercase">Derived from main draft & source context</p>
                </div>
                <Badge variant="success" className="bg-brand/10 text-brand border-brand/20 shrink-0">Socialise</Badge>
            </div>

            <div className="space-y-4 relative before:absolute before:left-6 before:top-8 before:bottom-8 before:w-0.5 before:bg-border/30">
                {allTweets.map((tweet, i) => (
                    <div key={i} className="relative pl-12 group">
                        {/* Thread Circle */}
                        <div className="absolute left-4 top-1 w-4 h-4 rounded-full border-2 border-brand bg-background z-10" />
                        
                        <div className="p-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/30 transition-all relative">
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
            return <SocialiseResult data={d as Record<string, unknown>} />
        default:
            return <GenericResult data={typeof d === 'string' ? { message: d } : (d as Record<string, unknown>)} />
    }
}


// Export for use in Inspect panel with full detail
export function StageResultPanel({ stageId, data }: { stageId: StageId; data: Record<string, unknown> }) {
    const d = (data.data as Record<string, unknown>) || data.result || data;
    const wordCount = stageId === "draft" 
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
            <StageResultView stageId={stageId} data={data} compact={false} />
        </div>
    )
}
