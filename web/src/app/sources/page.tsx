"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { SourceCandidate } from "@/lib/mockData"
import Link from "next/link"
import {
    Search, Loader2, Clock, CheckCircle, AlertCircle, ArrowRight,
    Sparkles, Bot, X, ChevronDown, Calendar, Tag, Timer, Upload,
    Play, FileText
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Helpers ────────────────────────────────────────────────────────────────

type Tab = "processed" | "processing" | "unprocessed"

const TABS: { key: Tab; label: string; color: string }[] = [
    { key: "processed", label: "Processed", color: "text-emerald-600" },
    { key: "processing", label: "Processing", color: "text-brand" },
    { key: "unprocessed", label: "Unprocessed", color: "text-amber-600" },
]

function getTab(source: SourceCandidate): Tab {
    const completed = source.completedStages || []
    if (completed.includes("export")) return "processed"
    if (source.status === "processing" || (completed.length > 1 && !completed.includes("export"))) return "processing"
    return "unprocessed"
}

function scoreColor(s: number) {
    return s >= 8 ? "text-emerald-600" : s >= 6 ? "text-amber-600" : "text-red-500"
}
function scoreBorder(s: number) {
    return s >= 8 ? "border-emerald-200/80" : s >= 6 ? "border-amber-200/60" : "border-red-200/50"
}

async function persistSource(source: SourceCandidate) {
    try {
        await fetch("/api/store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "upsert", source }),
        })
    } catch { /* silently fail */ }
}

function isYouTubeUrl(s: string) { return /(?:youtube\.com\/watch|youtu\.be\/)/.test(s) }
function isVimeoUrl(s: string) { return /vimeo\.com\/\d+/.test(s) }
function isPodcastUrl(s: string) { return /\.mp3|\.m4a|spotify\.com\/(?:episode|show)|podcasts\.apple\.com/.test(s) }
function isRssUrl(s: string) { return /\.rss|\.xml|\/feed(?:s)?\/|\/rss\//.test(s) }

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SourcesPage() {
    const [query, setQuery] = useState("")
    const [sources, setSources] = useState<SourceCandidate[]>([])
    const [suggestions, setSuggestions] = useState<SourceCandidate[]>([])
    const [activeTab, setActiveTab] = useState<Tab>("unprocessed")
    const router = useRouter()
    const [isDiscovering, setIsDiscovering] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const filterRef = useRef<HTMLDivElement>(null)
    const [isTyping, setIsTyping] = useState(false)
    const suggestionTimeout = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        fetch("/api/store")
            .then(r => r.ok ? r.json() : { sources: [] })
            .then(data => setSources((data.sources || []) as SourceCandidate[]))
            .catch(() => { })
            .finally(() => setIsLoaded(true))
    }, [])

    // Close filter dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilters(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    // ── Smart Suggestions ──────────────────────────────────────────────────
    useEffect(() => {
        const isUrl = isYouTubeUrl(query) || isVimeoUrl(query) || isPodcastUrl(query) || isRssUrl(query) || query.startsWith("http")
        
        if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current)

        if (query.trim().length > 2 && !isUrl) {
            setIsTyping(true)
            suggestionTimeout.current = setTimeout(async () => {
                try {
                    const res = await fetch("/api/sources/discover", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ query: query.trim(), max: 5 }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                        setSuggestions((data.sources || []) as SourceCandidate[])
                    }
                } catch { /* ignore suggestion errors */ }
                finally { setIsTyping(false) }
            }, 500) // 500ms debounce
        } else if (query.trim().length === 0) {
            setSuggestions([])
        }
    }, [query])

    // autoJudge has been removed. We now auto-navigate to the detailed page to run the pipeline.

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setIsDiscovering(true)
        setError(null)
        try {
            const res = await fetch("/api/sources/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Search failed")

            const isUrl = isYouTubeUrl(query) || isVimeoUrl(query) || isPodcastUrl(query) || query.startsWith("http://") || query.startsWith("https://")
            
            if (isUrl && data.sources && data.sources.length > 0) {
                const s = data.sources[0]
                if (!sources.find(src => src.id === s.id)) {
                    const importing: SourceCandidate = { ...s, status: "idle" }
                    setSources(prev => [importing, ...prev])
                    persistSource(importing)
                }
                setQuery("")
                router.push(`/sources/${s.id}`)
                return
            }

            setSuggestions(data.sources as SourceCandidate[])
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error")
        } finally {
            setIsDiscovering(false)
        }
    }

    const importSuggestion = (s: SourceCandidate) => {
        if (sources.find(src => src.id === s.id)) return
        const importing: SourceCandidate = { ...s, status: "idle" }
        setSources(prev => [importing, ...prev])
        setSuggestions(prev => prev.filter(x => x.id !== s.id))
        persistSource(importing)

        // Auto navigate to the detailed page
        router.push(`/sources/${s.id}`)
    }

    // ── Tab filtering ──────────────────────────────────────────────
    const tabCounts = Object.fromEntries(
        TABS.map(t => [t.key, sources.filter(s => getTab(s) === t.key).length])
    ) as Record<Tab, number>

    const filtered = sources
        .filter(s => getTab(s) === activeTab)
        .sort((a, b) => {
            const timeA = new Date(a.published).getTime() || 0
            const timeB = new Date(b.published).getTime() || 0
            
            // If both dates are valid or 0, sort chronologically starting with newest
            if (timeA !== timeB) return timeB - timeA
            
            // Fallback to score if dates match or are unparseable
            return b.score - a.score
        })


    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-serif font-semibold tracking-tight">Sources</h1>
                    <p className="text-muted-foreground mt-1">
                        Paste a URL or search a topic to discover and evaluate sources.
                    </p>
                </div>
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3">
                <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-1 max-w-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search topics or paste a URL..."
                            className="pl-9 pr-9"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            disabled={isDiscovering}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            {isTyping && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                            {query && !isTyping && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(""); setSuggestions([]) }}
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label="Clear search"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <Button type="submit" className="gap-2 shrink-0" disabled={isDiscovering || !query}>
                        {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> :
                            isYouTubeUrl(query) ? <Bot className="w-4 h-4" /> :
                            isVimeoUrl(query) ? <Play className="w-4 h-4" /> :
                            isPodcastUrl(query) ? <FileText className="w-4 h-4" /> : // Or a Mic icon
                            isRssUrl(query) ? <FileText className="w-4 h-4" /> :
                            query.startsWith("http") ? <Bot className="w-4 h-4" /> :
                            <Search className="w-4 h-4" />}
                        {(isYouTubeUrl(query) || isVimeoUrl(query) || isPodcastUrl(query) || isRssUrl(query) || query.startsWith("http")) ? "Import & Judge" : isDiscovering ? "Searching..." : "Search"}
                    </Button>
                </form>

                <Button
                    variant="outline"
                    className="gap-2 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'audio/*,video/*,.txt,.pdf';
                        input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                                const id = `local_${Math.random().toString(36).substring(7)}`
                                const newSource: SourceCandidate = {
                                    id,
                                    title: `Uploaded: ${file.name}`,
                                    channel: "Local Device",
                                    url: `local://${file.name}`,
                                    published: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                                    duration: "—",
                                    status: "idle",
                                    score: 0,
                                }
                                setSources(prev => [newSource, ...prev])
                                persistSource(newSource)
                                router.push(`/sources/${id}`)
                            }
                        };
                        input.click();
                    }}
                    type="button"
                >
                    <Upload className="w-4 h-4" /> Import from Device
                </Button>

                {/* Filter popover */}
                <div className="relative" ref={filterRef}>
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setShowFilters(!showFilters)}
                        type="button"
                    >
                        <ChevronDown className="w-4 h-4" /> Filter
                    </Button>
                    {showFilters && (
                        <div className="absolute right-0 top-10 z-20 w-56 bg-background border border-border rounded-xl shadow-lg p-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1">Filter by</p>
                            {[
                                { icon: Calendar, label: "Date Added" },
                                { icon: Tag, label: "Category" },
                                { icon: Timer, label: "Duration" },
                            ].map(({ icon: Icon, label }) => (
                                <button
                                    key={label}
                                    className="w-full flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg px-2 py-2 transition-colors"
                                    onClick={() => setShowFilters(false)}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">{error}</div>
            )}

            {/* Search suggestions */}
            {suggestions.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-brand" />
                            <span className="text-sm font-semibold">Discovered Sources</span>
                            <span className="text-xs text-muted-foreground">Click to import & judge</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setSuggestions([]); setQuery("") }} className="h-7 text-xs text-muted-foreground">
                            Dismiss
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {suggestions.map(s => (
                            <button
                                key={s.id}
                                onClick={() => importSuggestion(s)}
                                className="text-left p-4 rounded-xl border border-dashed border-brand/30 bg-brand/[0.02] hover:bg-brand/[0.06] hover:border-brand/50 transition-all duration-200 group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock className="w-3.5 h-3.5" />{s.duration}
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-brand/50 group-hover:text-brand transition-colors" />
                                </div>
                                <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors">{s.title}</h3>
                                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                    <span className="truncate max-w-[60%]">{s.channel}</span>
                                    <span>{s.published}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-border">
                <div className="flex items-center gap-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                                activeTab === tab.key
                                    ? `border-current ${tab.color}`
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {tabCounts[tab.key] > 0 && (
                                <span className={cn(
                                    "text-xs rounded-full px-1.5 py-0.5 font-medium min-w-[20px] text-center",
                                    activeTab === tab.key ? "bg-current/10" : "bg-muted"
                                )}>
                                    {tabCounts[tab.key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sources grid */}
            {!isLoaded ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                        <Search className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-base font-medium">
                        No {activeTab} sources yet
                    </p>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        {activeTab === "processed"
                            ? "Fully processed sources will appear here."
                            : activeTab === "unprocessed"
                                ? "Import a source or select one from below to start processing."
                                : "Sources currently being processed appear here."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(source => {
                        const isProcessing = source.status === "processing"
                        const accepted = source.score >= 6
                        const rejected = source.score > 0 && source.score < 6

                        return (
                            <Link key={source.id} href={`/sources/${source.id}`}>
                                <Card className={cn(
                                    "h-full transition-all duration-200 hover:shadow-soft cursor-pointer group relative overflow-hidden",
                                    accepted ? scoreBorder(source.score) : rejected ? "border-red-200/50 opacity-80" : ""
                                )}>
                                    {isProcessing && (
                                        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand/0 via-brand to-brand/0 animate-pulse" />
                                    )}
                                    <div className="p-5 space-y-3">
                                        {/* Top row */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="w-3.5 h-3.5" />{source.duration}
                                            </div>
                                            {isProcessing ? (
                                                <div className="flex items-center gap-1.5 text-xs text-brand">
                                                    <Loader2 className="w-3 h-3 animate-spin" />Processing...
                                                </div>
                                            ) : source.score > 0 ? (
                                                <div className={cn("flex items-center gap-1.5 text-xs font-semibold", scoreColor(source.score))}>
                                                    {accepted ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                                    {source.score}/10
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Title */}
                                        <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors">
                                            {source.title}
                                        </h3>

                                        {/* Meta */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span className="truncate max-w-[65%]">{source.channel}</span>
                                            <span>{source.published}</span>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
