"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SourceCandidate } from "@/lib/mockData"
import Link from "next/link"
import {
    Plus, Search, ChevronDown,
    Play, Grid, List, Trash2, ArrowRight, ChevronRight
} from "lucide-react"
import { UnifiedSourceInput } from "@/components/workspace/UnifiedSourceInput"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import { format as formatDate, parseISO } from "date-fns"
import { Badge } from "@/components/ui/Badge"

// ── Helpers ────────────────────────────────────────────────────────────────

type Tab = "processed" | "processing" | "unprocessed"
type ViewMode = "grid" | "list"

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

function getPlatformBadge(platform: string) {
    const p = platform.toLowerCase()
    if (p.includes("youtube")) return "bg-red-50 text-red-700 border-red-100"
    if (p.includes("twitter") || p.includes("x.com")) return "bg-sky-50 text-sky-700 border-sky-100"
    if (p.includes("web") || p.includes("article")) return "bg-emerald-50 text-emerald-700 border-emerald-100"
    if (p.includes("podcast")) return "bg-purple-50 text-purple-700 border-purple-100"
    return "bg-slate-50 text-slate-700 border-slate-100"
}

function formatDisplayDate(dateStr: string) {
    if (!dateStr || dateStr === "—" || dateStr === "Recently" || dateStr === "Today") return dateStr
    try {
        const date = parseISO(dateStr)
        return formatDate(date, "MMM dd, yyyy")
    } catch {
        return dateStr
    }
}

async function deleteSource(id: string) {
    try {
        await fetch("/api/store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id }),
        })
        return true
    } catch { return false }
}

export default function SourcesPage() {
    const { t } = useLanguage()
    const router = useRouter()
    
    const [activeTab, setActiveTab] = useState<Tab>("processed")
    const [viewMode, setViewMode] = useState<ViewMode>("list")
    const [sources, setSources] = useState<SourceCandidate[]>([])
    const [platformFilter, setPlatformFilter] = useState("All")
    const [dateFilter, setDateFilter] = useState("All")
    const [showFilters, setShowFilters] = useState(false)
    const [isIngesting, setIsIngesting] = useState(false)
    const [ingestStatus, setIngestStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    const filterRef = useRef<HTMLDivElement>(null)

    const TABS: { key: Tab; label: string; color: string }[] = [
        { key: "processed", label: t("processed"), color: "text-emerald-600" },
        { key: "processing", label: t("processing"), color: "text-brand" },
        { key: "unprocessed", label: t("unprocessed"), color: "text-amber-600" },
    ]

    // Close filters on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setShowFilters(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])


    // Load sources
    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/store")
                if (res.ok) {
                    const data = await res.json()
                    setSources(data.sources || [])
                }
            } catch { /* fail silently */ }
        }
        load()
    }, [])

    const filteredSources = sources.filter(s => {
        const matchTab = getTab(s) === activeTab
        const sType = s.source_type || "Unknown"
        const matchPlatform = platformFilter === "All" || sType === platformFilter
        
        let matchDate = true
        if (dateFilter !== "All") {
            const now = new Date()
            const ingestedAt = s.processedAt ? new Date(s.processedAt) : new Date() // Fallback for mock
            const diffDays = Math.floor((now.getTime() - ingestedAt.getTime()) / (1000 * 60 * 60 * 24))
            
            if (dateFilter === "Today") matchDate = diffDays === 0
            else if (dateFilter === "Yesterday") matchDate = diffDays === 1
            else if (dateFilter === "Last 7 Days") matchDate = diffDays <= 7
        }
        
        return matchTab && matchPlatform && matchDate
    })

    const handleDelete = async (id: string) => {
        if (confirm("Delete this source?")) {
            const ok = await deleteSource(id)
            if (ok) setSources(sources.filter(s => s.id !== id))
        }
    }

    const handleFileSelect = (file: File) => {
        const isAudio = file.type.startsWith('audio');
        const typeLabel = isAudio ? "Audio" : "Video";
        
        setIngestStatus({
            type: 'success',
            message: `Importing local ${typeLabel.toLowerCase()} file: ${file.name}...`
        });
        
        // Simulate adding to list
        const newId = `local-${Date.now()}`;
        const mockSource: SourceCandidate = {
            id: newId,
            title: file.name.split('.')[0],
            channel: "Local Device",
            url: "file://local-import",
            published: formatDate(new Date(), "MMM dd, yyyy"),
            duration: "Processing...",
            status: "processing",
            score: 0,
            completedStages: ["judge"]
        };
        
        setSources(prev => [mockSource, ...prev]);
        
        // Auto-clear status
        setTimeout(() => setIngestStatus(null), 3000);
        
        // Navigate to detail after a short delay
        setTimeout(() => router.push(`/sources/${newId}`), 1000);
    }

    return (
        <div className="p-8 px-12 max-w-[1500px] mx-auto space-y-8 min-h-full">
            <div className="space-y-1">
                <h1 className="text-3xl font-serif font-semibold tracking-tight">{t("sources")}</h1>
                <p className="text-muted-foreground">{t("searchPlaceholder")}</p>
            </div>

            {ingestStatus && (
                <div className={cn(
                    "p-4 rounded-lg border text-sm animate-in fade-in slide-in-from-top-2",
                    ingestStatus.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                )}>
                    {ingestStatus.message}
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="flex-1 w-full">
                    <UnifiedSourceInput 
                        onIngest={async (input) => {
                            if (!input || !input.trim()) return
                            setIsIngesting(true)
                            setIngestStatus(null)

                            // Intelligent detection: URL vs Topic
                            const isURL = /^https?:\/\//i.test(input.trim()) || 
                                          input.includes('.') && !input.includes(' ')

                            try {
                                if (isURL) {
                                    const res = await fetch("/api/sources/ingest", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ url: input })
                                    })
                                    const data = await res.json()
                                    if (res.ok && data.result?.source_id) {
                                        router.push(`/sources/${data.result.source_id}`)
                                    } else {
                                        setIngestStatus({ type: 'error', message: data.error || "Failed to ingest source." })
                                    }
                                } else {
                                    // Topic Discovery Search
                                    const res = await fetch("/api/sources/discover", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ query: input })
                                    })
                                    if (res.ok) {
                                        const data = await res.json()
                                        // Update local source candidates with discovered ones
                                        // In a real app, this might open a discovery modal
                                        setSources(prev => [...(data.sources || []), ...prev])
                                        setIngestStatus({ type: 'success', message: `Discovered items for topic: ${input}` })
                                    } else {
                                        setIngestStatus({ type: 'error', message: "Topic search failed." })
                                    }
                                }
                            } catch (err) {
                                console.error("Source operation failed:", err)
                                setIngestStatus({ type: 'error', message: "Operation failed." })
                            } finally {
                                setIsIngesting(false)
                                setTimeout(() => setIngestStatus(null), 5000)
                            }
                        }}
                        onFileSelect={handleFileSelect}
                        isIngesting={isIngesting}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative shrink-0" ref={filterRef}>
                        <Button variant="outline" className={cn("gap-2 h-12 px-6 font-serif font-medium shadow-micro rounded-xl border-border", platformFilter !== "All" && "border-brand text-brand bg-brand/5")} onClick={() => setShowFilters(!showFilters)} type="button">
                            <ChevronDown className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} /> 
                            <span className="text-sm">{platformFilter === "All" ? t("filter") : platformFilter}</span>
                        </Button>
                        
                        {showFilters && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border shadow-soft rounded-xl p-1 z-50 animate-in fade-in slide-in-from-top-2">
                                <div className="p-2">
                                    <p className="px-2 py-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{t("platform")}</p>
                                    <div className="space-y-0.5">
                                        {["All", "YouTube", "Twitter", "Web Articles"].map(p => (
                                            <button 
                                                key={p} 
                                                className={cn(
                                                    "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between",
                                                    platformFilter === p ? "bg-brand/5 text-brand font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                                )}
                                                onClick={() => setPlatformFilter(p)}
                                            >
                                                {p}
                                                {platformFilter === p && <div className="w-1.5 h-1.5 rounded-full bg-brand" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="border-t border-border/50 p-2">
                                    <p className="px-2 py-1 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{t("dateAdded")}</p>
                                    <div className="space-y-0.5">
                                        {[
                                            { key: "All", label: t("all") },
                                            { key: "Today", label: t("today") },
                                            { key: "Yesterday", label: t("yesterday") },
                                            { key: "Last 7 Days", label: t("last7Days") }
                                        ].map(d => (
                                            <button 
                                                key={d.key} 
                                                className={cn(
                                                    "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between",
                                                    dateFilter === d.key ? "bg-brand/5 text-brand font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                                )}
                                                onClick={() => setDateFilter(d.key)}
                                            >
                                                {d.label}
                                                {dateFilter === d.key && <div className="w-1.5 h-1.5 rounded-full bg-brand" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-8 border-b border-border">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "pb-3 text-sm font-medium transition-all relative",
                                activeTab === tab.key 
                                    ? "text-brand" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label} <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                {sources.filter(s => getTab(s) === tab.key).length}
                            </span>
                            {activeTab === tab.key && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />
                            )}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1 pb-3">
                        <button 
                            onClick={() => setViewMode("grid")}
                            className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}
                            title="Grid view"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setViewMode("list")}
                            className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}
                            title="List view"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {filteredSources.length === 0 ? (
                    <div className="py-20 text-center animate-in fade-in duration-500">
                        <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Search className="w-8 h-8 text-muted-foreground/30" />
                        </div>
                        <h3 className="text-lg font-medium text-foreground">{t("noSourcesFound")}</h3>
                        <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-1">{t("noSourcesDescription")}</p>
                        <Button 
                            variant="outline"
                            className="mt-6 gap-2 font-serif font-medium"
                            onClick={() => {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) alert(`Importing ${file.name}...`);
                                };
                                input.click();
                            }}
                        >
                            <Plus className="w-4 h-4" /> {t("importFromDevice")}
                        </Button>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
                        {filteredSources.map(source => (
                            <Card key={source.id} className="overflow-hidden flex flex-col group hover:shadow-soft hover:border-gray-300 transition-all duration-300 relative">
                                <Link href={`/sources/${source.id}`} className="flex-1 flex flex-col">
                                    <div className="aspect-video relative overflow-hidden bg-muted">
                                        {source.thumbnail ? (
                                            <img src={source.thumbnail} alt={source.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Play className="w-10 h-10 text-muted-foreground/20" />
                                            </div>
                                        )}
                                        {source.duration && (
                                            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm tracking-wider">
                                                {source.duration}
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col">
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <h3 className="font-serif font-semibold text-lg leading-tight line-clamp-2 group-hover:text-brand transition-colors">{source.title}</h3>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center overflow-hidden text-[8px]">
                                                <img src={`https://www.google.com/s2/favicons?domain=${(source.source_type || "youtube").toLowerCase()}.com&sz=32`} alt="" className="w-3 h-3" />
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">{source.channel}</span>
                                        </div>
                                    </div>
                                </Link>

                                <div className="px-5 pb-5 mt-auto pt-4 border-t border-border/50 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className={cn("px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider", scoreBorder(source.score), scoreColor(source.score))}>
                                            QUAL SCORE: {source.score > 0 ? `${source.score}/10` : "--"}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-serif font-medium uppercase tracking-tight">
                                            <span className="opacity-60">{t("dateAdded")}:</span>
                                            <span className="text-foreground/70">{formatDisplayDate(source.processedAt || source.published) || "Today"}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(source.id); }}
                                    className="absolute bottom-4 right-4 p-2 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all z-10"
                                    title="Delete source"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="border border-border rounded-xl bg-card overflow-hidden animate-in fade-in duration-500 text-slate-900 shadow-sleek">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/10 border-b border-border/50">
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest font-serif">{t("source")}</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest text-center font-serif">Platform</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest text-center font-serif">QUAL SCORE</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest text-center font-serif">{t("dateAdded")}</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest text-right font-serif">View</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest text-right font-serif">{t("actions")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredSources.map(source => (
                                    <tr 
                                        key={source.id} 
                                        onClick={() => router.push(`/sources/${source.id}`)}
                                        className="group hover:bg-muted/20 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-8 rounded bg-muted overflow-hidden shrink-0">
                                                    {source.thumbnail ? <img src={source.thumbnail} alt="" className="w-full h-full object-cover" /> : <Play className="w-4 h-4 m-auto text-muted-foreground/20 mt-2" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <Link href={`/sources/${source.id}`} className="text-sm font-medium text-foreground hover:text-brand transition-colors block truncate pr-4">
                                                        {source.title}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground truncate">{source.channel}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider h-5 shadow-micro", getPlatformBadge(source.source_type || "YouTube"))}>
                                                {source.source_type || "YouTube"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn("text-sm font-serif font-bold italic", scoreColor(source.score))}>
                                                {source.score > 0 ? `${source.score}/10` : "--"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <span className="opacity-60">{t("dateAdded")}:</span>
                                                    <span className="font-medium text-foreground/70">{formatDisplayDate(source.processedAt || source.published) || "Today"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(source.id); }}
                                                    className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground/30 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                    title="Delete source"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}


