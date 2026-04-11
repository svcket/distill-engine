"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SourceCandidate } from "@/lib/mockData"
import Link from "next/link"
import {
    Plus, Search, ChevronDown,
    Trash2,
    Paperclip, Mic
} from "lucide-react"
import { UnifiedSourceInput, type UnifiedSourceInputHandle } from "@/components/workspace/UnifiedSourceInput"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"
import { format as formatDate, parseISO } from "date-fns"
import { Badge } from "@/components/ui/Badge"
import Image from "next/image"

// ── Helpers ────────────────────────────────────────────────────────────────

type Tab = "processed" | "processing" | "unprocessed"
type ViewMode = "grid" | "list"

function getTab(source: SourceCandidate): Tab {
    if (!source) return "unprocessed"
    const completedArr = source.completedStages || []
    if (source.status === "done" || completedArr.includes("qa") || completedArr.includes("export")) return "processed"
    if (source.status === "processing" || (completedArr.length > 0 && !completedArr.includes("qa"))) return "processing"
    return "unprocessed"
}

function getPlatformBadge(platform: string) {
    const p = (platform || "").toLowerCase()
    if (p.includes("youtube")) return "bg-red-500/10 text-red-500 border-red-500/20"
    if (p.includes("spotify")) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    if (p.includes("apple") || p.includes("podcast")) return "bg-purple-500/10 text-purple-500 border-purple-500/20"
    if (p.includes("vimeo")) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
    if (p.includes("rss") || p.includes("web") || p.includes("http")) return "bg-slate-500/10 text-slate-500 border-slate-500/20"
    return "bg-slate-500/10 text-slate-500 border-slate-500/20"
}

function formatDisplayDate(dateStr: string) {
    if (!dateStr || dateStr === "—" || dateStr === "Recently" || dateStr === "Today") return "Just now"
    try {
        const date = parseISO(dateStr)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
        if (diff < 60) return "Just now"
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
        return formatDate(date, "MMM dd, yyyy")
    } catch { return "Just now" }
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
    const [viewMode, setViewMode] = useState<ViewMode>("grid")
    const [sources, setSources] = useState<SourceCandidate[]>([])
    const [platformFilter, setPlatformFilter] = useState("All")
    const [showFilters, setShowFilters] = useState(false)
    const [isIngesting, setIsIngesting] = useState(false)
    const [ingestStatus, setIngestStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    const filterRef = useRef<HTMLDivElement>(null)
    const sourceInputRef = useRef<UnifiedSourceInputHandle>(null)

    const TABS: { key: Tab; label: string; color: string }[] = [
        { key: "processed", label: t("processed"), color: "text-emerald-600" },
        { key: "processing", label: t("processing"), color: "text-brand" },
        { key: "unprocessed", label: t("unprocessed"), color: "text-amber-600" },
    ]

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 1024) {
                setViewMode("grid")
            }
        }
        handleResize()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setShowFilters(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/store")
                if (res.ok) {
                    const data = await res.json()
                    setSources(data.sources || [])
                } else if (res.status === 401) {
                    router.push("/login")
                }
            } catch { /* fail silently */ }
        }
        load()
    }, [router])

    const filteredSources = (sources || []).filter(s => {
        if (!s) return false
        const matchTab = getTab(s) === activeTab
        const sType = (s.source_type || s.type || "Unknown").toLowerCase()
        
        let matchPlatform = platformFilter === "All"
        if (!matchPlatform) {
            const filter = platformFilter.toLowerCase()
            if (filter === "web articles") matchPlatform = sType === "rss" || sType === "article" || sType === "web"
            else if (filter === "documents") matchPlatform = sType === "document" || sType === "pdf" || sType === "upload" && s.url?.endsWith(".pdf")
            else matchPlatform = sType.includes(filter)
        }
        
        return matchTab && matchPlatform
    })

    const activeFiltersCount = [
        platformFilter !== "All"
    ].filter(Boolean).length



    const handleDelete = async (id: string) => {
        if (confirm("Delete this source?")) {
            const ok = await deleteSource(id)
            if (ok) setSources(sources.filter(s => s.id !== id))
        }
    }

    const handleIngest = async (input: string) => {
        if (!input || !input.trim()) return
        setIsIngesting(true)
        setIngestStatus(null)
        const isURL = /^https?:\/\//i.test(input.trim()) || (input.includes('.') && !input.includes(' '))
        try {
            if (isURL) {
                const res = await fetch("/api/sources/ingest", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: input })
                })
                const data = await res.json()
                if (res.ok && data.result?.id) router.push(`/sources/${data.result.id}`)
                else setIngestStatus({ type: 'error', message: data.error || "Failed to ingest source." })
            } else {
                // GUARD: Topic discovery should only trigger on concise keywords. 
                // Long strings (likely failed URL pastes) should be rejected or trimmed.
                if (input.length > 150) {
                    setIngestStatus({ type: 'error', message: "Search term too long. Please provide a brief topic or a valid URL." });
                    return;
                }
                const res = await fetch("/api/sources/discover", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: input })
                })
                if (res.ok) {
                    const data = await res.json()
                    setSources(prev => [...(data.sources || []), ...prev])
                    setIngestStatus({ type: 'success', message: `Discovered items for topic: ${input}` })
                } else setIngestStatus({ type: 'error', message: "Topic search failed." })
            }
        } catch {
            setIngestStatus({ type: 'error', message: "Operation failed." })
        } finally {
            setIsIngesting(false)
            setTimeout(() => setIngestStatus(null), 5000)
        }
    }

    const handleFileSelect = async (file: File) => {
        setIsIngesting(true);
        setIngestStatus({ type: 'success', message: `Uploading ${file.name}...` });
        try {
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch("/api/sources/upload", { method: "POST", body: formData });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");
            setIngestStatus({ type: 'success', message: "Processing file metadata..." });
            const ingestRes = await fetch("/api/sources/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: uploadData.url })
            });
            const ingestData = await ingestRes.json();
            if (!ingestRes.ok) throw new Error(ingestData.error || "Ingest failed");
            if (ingestData.result?.id) router.push(`/sources/${ingestData.result.id}`);
        } catch {
            setIngestStatus({ type: 'error', message: "Failed to import local file." });
        } finally {
            setIsIngesting(false);
            setTimeout(() => setIngestStatus(null), 5000);
        }
    }

    return (
        <div className="p-4 lg:p-8 lg:px-12 max-w-[1500px] mx-auto space-y-6 lg:space-y-8 min-h-full">
            <div className="space-y-1">
                <h1 className="text-2xl lg:text-3xl font-serif font-semibold tracking-tight">{t("sources")}</h1>
            </div>

            {ingestStatus && (
                <div className={cn(
                    "p-4 rounded-lg border text-sm max-h-[150px] overflow-y-auto animate-in fade-in slide-in-from-top-2",
                    ingestStatus.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                )}>
                    <p className="line-clamp-3 overflow-y-auto">{ingestStatus.message}</p>
                </div>
            )}

            <div className="flex flex-col lg:flex-row lg:items-center gap-2 w-full mb-6 lg:mb-8">
                <div className="w-full lg:flex-1 min-w-0">
                    <UnifiedSourceInput 
                        ref={sourceInputRef}
                        onIngest={handleIngest} 
                        onFileSelect={handleFileSelect}
                        isIngesting={isIngesting}
                    />
                </div>
                
                <div className="flex items-center gap-2 mt-2 lg:mt-0">
                    <Button 
                        variant="outline" 
                        size="icon"
                        className="h-10 w-10 lg:h-12 lg:w-12 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-all shadow-sm group"
                        onClick={() => sourceInputRef.current?.upload()}
                        title="Attach source"
                    >
                        <Paperclip className="w-4 h-4 group-hover:text-brand transition-colors" />
                    </Button>
                    <Button 
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 lg:h-12 lg:w-12 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-all shadow-sm group"
                        onClick={() => sourceInputRef.current?.record()}
                        title="Record audio"
                    >
                        <Mic className="w-4 h-4 group-hover:text-brand transition-colors" />
                    </Button>
                    
                    <button 
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "flex items-center gap-2 px-6 h-10 lg:h-12 rounded-xl border text-xs font-serif font-medium transition-all shadow-sm",
                            activeFiltersCount > 0 
                                ? "bg-brand/10 border-brand text-brand" 
                                : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                    >
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")} />
                        <span>{t("filter")}</span>
                        {activeFiltersCount > 0 && (
                            <span className="w-4 h-4 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-bold">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                    
                    {showFilters && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border shadow-soft rounded-xl p-1 z-50 animate-in fade-in slide-in-from-top-2 overflow-y-auto max-h-[80vh]">
                            <div className="p-2">
                                <div className="flex items-center justify-between px-2 mb-1">
                                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{t("platform")}</p>
                                    {platformFilter !== "All" && <button onClick={() => setPlatformFilter("All")} className="text-[9px] font-bold text-brand uppercase">Reset</button>}
                                </div>
                                <div className="space-y-0.5">
                                    {["All", "YouTube", "Twitter", "Web Articles", "Documents"].map(p => (
                                        <button 
                                            key={p} 
                                            className={cn(
                                                "w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between",
                                                platformFilter === p ? "bg-brand/5 text-brand font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={() => setPlatformFilter(p)}
                                        >
                                            {p} {platformFilter === p && <div className="w-1.5 h-1.5 rounded-full bg-brand" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-6 lg:gap-8 border-b border-border overflow-x-auto no-scrollbar scroll-smooth">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "pb-3 text-xs lg:text-sm font-medium transition-all relative whitespace-nowrap",
                                activeTab === tab.key ? "text-brand" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label} <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                {sources.filter(s => getTab(s) === tab.key).length}
                            </span>
                            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1 pb-3">
                    </div>
                </div>

                {filteredSources.length === 0 ? (
                    <div className="py-12 lg:py-20 text-center">
                        <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4"><Search className="w-8 h-8 text-muted-foreground/30" /></div>
                        <h3 className="text-lg font-medium text-foreground">{t("noSourcesFound")}</h3>
                        <Button variant="outline" className="mt-6 gap-2 font-serif font-medium" onClick={() => { const i = document.createElement("input"); i.type = "file"; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileSelect(f) }; i.click(); }}><Plus className="w-4 h-4" /> {t("importFromDevice")}</Button>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-3">
                        {filteredSources.map(source => (
                            <Card key={source.id} className="overflow-hidden flex flex-col group hover:shadow-2xl hover:border-brand/30 transition-all duration-500 relative bg-transparent border-white/5 backdrop-blur-[2px]">
                                <Link href={`/sources/${source.id}`} className="flex-1 flex flex-col">
                                    <div className="aspect-video relative overflow-hidden bg-transparent">
                                        <Image 
                                            src={source?.thumbnail || (
                                                (source?.source_type || "").includes("youtube") ? "/thumbnail/thumbnail_youtube.png" :
                                                (source?.source_type || "").includes("spotify") ? "/thumbnail/thumbnail_spotify_podcast.png" :
                                                (source?.source_type || "").includes("apple") || (source?.source_type || "").includes("podcast") ? "/thumbnail/thumbnail_apple_podcast.png" :
                                                "/thumbnail/thumbnail_rss.png"
                                            )} 
                                            alt={source?.title || "Source"} 
                                            fill 
                                            className="object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-90" 
                                        />
                                        {/* Premium Glassmorphic Overlay to reduce distraction and increase contrast */}
                                        <div className="absolute inset-0 bg-black/20 backdrop-blur-[0px] group-hover:bg-black/10 transition-all duration-500" />
                                        
                                        {source?.duration && (
                                            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/80 text-[10px] font-black text-white backdrop-blur-md border border-white/10 tracking-widest tabular-nums z-10">
                                                {source?.duration}
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-500" />
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-4 h-4 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
                                                    <Image src={`https://www.google.com/s2/favicons?domain=${(source?.source_type || source?.type || "web").toLowerCase()}.com&sz=32`} alt="" width={10} height={10} className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{source?.channel || (source?.source_type || source?.type || "Source")}</span>
                                            </div>
                                            <h3 className="font-serif font-semibold text-[18px] leading-snug line-clamp-2 mb-4 text-foreground/90 group-hover:text-white transition-colors">{source?.title || "Unknown Source"}</h3>
                                        
                                        <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
                                            <div className="text-[12px] font-black uppercase tracking-widest tabular-nums text-foreground">
                                                DQM: {source.score || source.dqmScore || "0"}/100
                                            </div>
                                            <div className="text-[9px] text-muted-foreground/40 font-bold uppercase tracking-tighter whitespace-nowrap">
                                                {formatDisplayDate(source.createdAt)}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                                <button title="Delete Source" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(source.id); }} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 backdrop-blur-md text-white/20 hover:text-red-500 hover:bg-red-500/20 border border-white/5 transition-all z-10 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="border border-border rounded-xl bg-transparent overflow-x-auto shadow-sleek no-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[300px] lg:min-w-0">
                            <thead>
                                <tr className="bg-muted/10 border-b border-border/50">
                                    <th className="px-4 py-4 text-[12px] font-bold text-foreground/80 uppercase tracking-widest font-serif">{t("source")}</th>
                                    <th className="hidden lg:table-cell px-4 py-4 text-[12px] font-bold text-foreground/80 uppercase tracking-widest text-center font-serif">Platform</th>
                                    <th className="fixed-width-col px-4 py-4 text-[12px] font-bold text-foreground/80 uppercase tracking-widest text-center font-serif">Duration</th>
                                    <th className="hidden sm:table-cell px-4 py-4 text-[12px] font-bold text-foreground/80 uppercase tracking-widest text-center font-serif">DQM Score</th>
                                    <th className="px-4 py-4 text-[12px] font-bold text-foreground/80 uppercase tracking-widest text-right font-serif">{t("actions")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredSources.map(source => {
                                    const score = source.dqmScore || source.score || 0
                                    return (
                                        <tr key={source.id} onClick={() => router.push(`/sources/${source.id}`)} className="group hover:bg-muted/5 transition-colors cursor-pointer">
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-14 h-9 rounded-lg bg-muted overflow-hidden shrink-0 relative border border-border/30">
                                                        <Image 
                                                            src={source.thumbnail || (
                                                                (source.source_type || "").includes("youtube") ? "/thumbnail/thumbnail_youtube.png" :
                                                                (source.source_type || "").includes("spotify") ? "/thumbnail/thumbnail_spotify_podcast.png" :
                                                                (source.source_type || "").includes("apple") || (source.source_type || "").includes("podcast") ? "/thumbnail/thumbnail_apple_podcast.png" :
                                                                "/thumbnail/thumbnail_rss.png"
                                                            )} 
                                                            alt="" 
                                                            fill 
                                                            className="object-cover opacity-80" 
                                                        />
                                                        <div className="absolute inset-0 bg-zinc-950/20 backdrop-blur-[0.5px]" />
                                                    </div>
                                                    <div className="min-w-0 flex flex-col py-1">
                                                        <Link href={`/sources/${source.id}`} className="text-[17px] font-semibold text-foreground whitespace-normal break-words line-clamp-2 leading-tight group-hover:text-brand transition-colors">
                                                            {source.title}
                                                        </Link>
                                                        <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-tight">
                                                            {formatDisplayDate(source.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden lg:table-cell px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn("text-[11px] uppercase font-bold px-3 py-1 border-none", getPlatformBadge(source?.source_type || source?.type || ""))}>
                                                    {source?.source_type || source?.type || "unknown"}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center text-[14px] font-serif text-muted-foreground tabular-nums">
                                                {source?.duration || "--:--"}
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-3 text-center">
                                                <div className="text-[13px] font-bold uppercase tabular-nums text-foreground">
                                                    {score || "0"}/100
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right sticky right-0 w-14 min-w-[56px]">
                                                <button 
                                                    title="Delete Source"
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(source.id); }} 
                                                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500 transition-all opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
