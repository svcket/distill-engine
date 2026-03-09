"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { SourceCandidate, Status } from "@/lib/mockData"
import Link from "next/link"
import { Search, Loader2, Clock, CheckCircle, AlertCircle, ArrowRight, Sparkles, Bot, X } from "lucide-react"
import { cn } from "@/lib/utils"

function scoreColor(score: number): string {
    if (score >= 8) return "text-emerald-600"
    if (score >= 6) return "text-amber-600"
    return "text-red-500"
}

function scoreBg(score: number): string {
    if (score >= 8) return "bg-emerald-50 border-emerald-200"
    if (score >= 6) return "bg-amber-50 border-amber-200"
    return "bg-red-50 border-red-200"
}

function scoreLabel(score: number): string {
    if (score >= 8) return "High Signal"
    if (score >= 6) return "Moderate"
    return "Low Signal"
}

// Save source to local persistence
async function persistSource(source: SourceCandidate) {
    try {
        await fetch("/api/store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "upsert",
                source: {
                    id: source.id,
                    title: source.title,
                    channel: source.channel,
                    url: source.url,
                    published: source.published,
                    duration: source.duration,
                    score: source.score,
                    status: source.status,
                }
            })
        })
    } catch { /* silently fail */ }
}

export default function SourcesPage() {
    const [query, setQuery] = useState("")
    const [sources, setSources] = useState<SourceCandidate[]>([])  // Start empty — no mock data
    const [suggestions, setSuggestions] = useState<SourceCandidate[]>([])  // Search results shown as suggestions
    const [isDiscovering, setIsDiscovering] = useState(false)
    const [isJudging, setIsJudging] = useState<string | null>(null)  // Track which source is being auto-judged
    const [error, setError] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    // Load persisted sources on mount — only real user sources, no mocks
    useEffect(() => {
        async function loadPersistedSources() {
            try {
                const res = await fetch("/api/store")
                if (!res.ok) { setIsLoaded(true); return }
                const data = await res.json()
                const stored = (data.sources || []) as SourceCandidate[]
                if (stored.length > 0) {
                    setSources(stored)
                }
            } catch { /* silently fail */ }
            finally { setIsLoaded(true) }
        }
        loadPersistedSources()
    }, [])

    const isYouTubeUrl = (str: string) => /(?:youtube\.com\/watch|youtu\.be\/)/.test(str)

    const extractVideoId = (url: string): string => {
        const vMatch = url.match(/[?&]v=([^&]+)/)
        if (vMatch) return vMatch[1]
        const shortMatch = url.match(/youtu\.be\/([^?]+)/)
        if (shortMatch) return shortMatch[1]
        return url
    }

    // Auto-judge: run Source Judge immediately after import
    const autoJudge = async (source: SourceCandidate) => {
        setIsJudging(source.id)
        try {
            const res = await fetch("/api/sources/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceId: source.id })
            })
            const data = await res.json()
            if (res.ok && data.result) {
                const updatedSource: SourceCandidate = {
                    ...source,
                    score: data.result.score || data.result.data?.score || 5,
                    status: (data.result.score || data.result.data?.score || 5) >= 6 ? "done" : "rejected",
                    title: data.result.title || data.result.data?.title || source.title,
                    channel: data.result.channel || data.result.data?.channel || source.channel,
                    duration: data.result.duration || data.result.data?.duration || source.duration,
                }
                setSources(prev => prev.map(s => s.id === source.id ? updatedSource : s))
                persistSource(updatedSource)

                // Also persist judge stage completion
                try {
                    await fetch("/api/store", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "complete_stage", sourceId: source.id, stageId: "judge" })
                    })
                } catch { /* ignore */ }
            }
        } catch { /* silently fail */ }
        finally { setIsJudging(null) }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query) return

        // URL import → add to sources + auto-judge
        if (isYouTubeUrl(query)) {
            const videoId = extractVideoId(query)
            // Don't add duplicate
            if (sources.find(s => s.id === videoId)) {
                setQuery("")
                return
            }
            const newSource: SourceCandidate = {
                id: videoId,
                title: `Evaluating: ${videoId}`,
                channel: "YouTube",
                url: query.startsWith("http") ? query : `https://${query}`,
                published: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                duration: "—",
                status: "processing",
                score: 0,
            }
            setSources(prev => [newSource, ...prev])
            persistSource(newSource)
            setQuery("")
            setSuggestions([]) // Clear suggestions

            // Auto-judge immediately
            autoJudge(newSource)
            return
        }

        // Topic search → show as suggestions, not permanent sources
        setIsDiscovering(true)
        setError(null)

        try {
            const res = await fetch("/api/sources/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to discover sources")

            // Show as suggestions — NOT added to permanent sources
            setSuggestions(data.sources as SourceCandidate[])

        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message)
            else setError("Unknown error")
        } finally {
            setIsDiscovering(false)
        }
    }

    // Import a suggestion → move from suggestions to sources, auto-judge
    const importSuggestion = (suggestion: SourceCandidate) => {
        if (sources.find(s => s.id === suggestion.id)) return // Already imported

        const importing: SourceCandidate = { ...suggestion, status: "processing" }
        setSources(prev => [importing, ...prev])
        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
        persistSource(importing)
        autoJudge(importing)
    }

    const clearSuggestions = () => {
        setSuggestions([])
        setQuery("")
    }

    // Sort: accepted (score ≥ 6) first, then processing, then the rest
    const sortedSources = [...sources].sort((a, b) => {
        const statusOrder = (s: SourceCandidate) => {
            if (s.status === "processing" || isJudging === s.id) return 0  // Processing at top
            if (s.score >= 6) return 1  // Accepted
            if (s.score > 0 && s.score < 6) return 3  // Rejected
            return 2  // Unscored
        }
        const orderA = statusOrder(a)
        const orderB = statusOrder(b)
        if (orderA !== orderB) return orderA - orderB
        return b.score - a.score  // Higher score first within group
    })

    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-serif font-semibold tracking-tight">Sources</h1>
                    <p className="text-muted-foreground mt-1">Paste a YouTube link to evaluate, or search a topic to discover sources.</p>
                </div>
                {sources.length > 0 && (
                    <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-xs">
                            {sources.filter(s => s.score >= 6).length} accepted
                        </Badge>
                        <Badge variant="secondary" className="text-xs bg-muted">
                            {sources.length} total
                        </Badge>
                    </div>
                )}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Paste a YouTube URL or search a topic..."
                        className="pl-9 pr-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={isDiscovering}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => { setQuery(""); setSuggestions([]) }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <Button type="submit" className="gap-2" disabled={isDiscovering || !query}>
                    {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        isYouTubeUrl(query) ? <Bot className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                    {isYouTubeUrl(query) ? "Import & Judge" : "Search"}
                </Button>
            </form>

            {error && (
                <div className="p-4 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                    Error: {error}
                </div>
            )}

            {/* ── SEARCH SUGGESTIONS (temporary, not saved) ── */}
            {suggestions.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-brand" />
                            <h2 className="text-sm font-semibold">Discovered Sources</h2>
                            <span className="text-xs text-muted-foreground">Click to import & judge</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={clearSuggestions} className="h-7 text-xs text-muted-foreground">
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
                                        <Clock className="w-3.5 h-3.5" />
                                        {s.duration}
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-brand/50 group-hover:text-brand transition-colors" />
                                </div>
                                <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors">
                                    {s.title}
                                </h3>
                                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                    <span className="truncate max-w-[60%]">{s.channel}</span>
                                    <span>{s.published}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── USER'S SOURCES (persisted) ── */}
            {!isLoaded ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : sortedSources.length === 0 && suggestions.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                    <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                        <Search className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-lg font-medium text-foreground">No sources yet</p>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                            Paste a YouTube URL above to import and evaluate it, or search a topic to discover relevant content.
                        </p>
                    </div>
                </div>
            ) : sortedSources.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Sources</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sortedSources.map(source => {
                            const judging = isJudging === source.id || source.status === "processing"
                            const accepted = source.score >= 6
                            const rejected = source.score > 0 && source.score < 6

                            return (
                                <Link key={source.id} href={`/sources/${source.id}`}>
                                    <Card className={cn(
                                        "h-full transition-all duration-200 hover:shadow-soft cursor-pointer group relative overflow-hidden",
                                        accepted ? "border-emerald-200/80 hover:border-emerald-300" :
                                            rejected ? "border-red-200/60 hover:border-red-300 opacity-80" :
                                                "hover:border-gray-300"
                                    )}>
                                        {/* Judging indicator */}
                                        {judging && (
                                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand/0 via-brand to-brand/0 animate-pulse" />
                                        )}
                                        <div className="p-5 space-y-3">
                                            {/* Status row */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {source.duration}
                                                </div>
                                                {judging ? (
                                                    <div className="flex items-center gap-1.5 text-xs text-brand">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Judging...
                                                    </div>
                                                ) : source.score > 0 ? (
                                                    <div className={cn(
                                                        "flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border",
                                                        scoreBg(source.score), scoreColor(source.score)
                                                    )}>
                                                        {accepted ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                                        {source.score}/10 · {scoreLabel(source.score)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* Title */}
                                            <h3 className="font-medium text-sm leading-snug text-balance group-hover:text-brand transition-colors line-clamp-2">
                                                {source.title}
                                            </h3>

                                            {/* Meta */}
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                <span className="truncate max-w-[60%]">{source.channel}</span>
                                                <span>{source.published}</span>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
