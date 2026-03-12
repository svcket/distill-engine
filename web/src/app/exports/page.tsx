"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Download, FileText, Eye, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"

interface Draft {
    id: string
    title: string
    content: string
    wordCount: number
    format: string
    status: string
    createdAt: string
}

export default function ExportsPage() {
    return (
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <ExportsContent />
        </Suspense>
    )
}

function ExportsContent() {
    const { t } = useLanguage()
    const [drafts, setDrafts] = useState<Draft[]>([])
    const [loading, setLoading] = useState(true)
    const [viewingDraft, setViewingDraft] = useState<Draft | null>(null)
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
    const [drawerDropdownOpen, setDrawerDropdownOpen] = useState(false)
    const searchParams = useSearchParams()

    // Handle auto-opening a draft from query params
    useEffect(() => {
        if (!loading && drafts.length > 0) {
            const id = searchParams.get("id")
            if (id) {
                const draft = drafts.find(d => d.id === id)
                if (draft) setViewingDraft(draft)
            }
        }
    }, [loading, drafts, searchParams])

    useEffect(() => {
        async function loadDrafts() {
            try {
                const res = await fetch("/api/exports/list")
                if (!res.ok) return
                const data = await res.json()
                setDrafts(data.drafts || [])
            } catch { /* silently fail */ }
            finally { setLoading(false) }
        }
        loadDrafts()
    }, [])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (openDropdownId || drawerDropdownOpen) {
                const target = e.target as HTMLElement
                if (!target.closest('.dropdown-container')) {
                    setOpenDropdownId(null)
                    setDrawerDropdownOpen(false)
                }
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [openDropdownId, drawerDropdownOpen])

    const downloadDraft = (draft: Draft) => {
        const blob = new Blob(
            [`# ${draft.title}\n\n${draft.content}`],
            { type: "text/markdown" }
        )
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${draft.id}_draft.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime()
        const minutes = Math.floor(diff / 60000)
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        return `${days}d ago`
    }

    return (
        <div className="flex h-full">
            {/* Main Content */}
            <div className={cn("flex-1 overflow-y-auto transition-all duration-300")}>
                <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-500">

                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="text-3xl font-serif font-semibold tracking-tight">{t("exports")}</h1>
                            <p className="text-muted-foreground mt-1">{t("readyDrafts")}</p>
                        </div>
                        {drafts.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{drafts.length} {t("library")} ready</Badge>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : drafts.length === 0 ? (
                        <div className="text-center py-20 space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
                                <FileText className="w-7 h-7 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-medium text-muted-foreground font-serif">No exports yet</p>
                            <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
                                {t("monitorSources")}
                            </p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {drafts.map(draft => (
                                <Card key={draft.id} className="flex flex-col group hover:shadow-soft hover:border-gray-300 transition-all duration-200">
                                    <CardHeader>
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant="secondary" className="gap-1 capitalize">
                                                <FileText className="w-3 h-3" />
                                                {draft.format.replace(/_/g, " ")}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">{timeAgo(draft.createdAt)}</span>
                                        </div>
                                        <CardTitle className="text-lg leading-tight font-serif">{draft.title}</CardTitle>
                                        <CardDescription className="text-[11px] uppercase tracking-wider font-medium opacity-70 mt-1">{draft.wordCount} words • ID: {draft.id.slice(0, 8)}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                                            {draft.content.replace(/[#*>\-]/g, "").trim().slice(0, 200)}...
                                        </p>
                                    </CardContent>
                                    <CardFooter className="pt-0 flex gap-2 relative">
                                        <Button
                                            className="flex-1 gap-2"
                                            onClick={() => setViewingDraft(draft)}
                                        >
                                            <Eye className="w-4 h-4" /> View Draft
                                        </Button>
                                        <div className="relative dropdown-container">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                title="Download options"
                                                onClick={() => setOpenDropdownId(openDropdownId === draft.id ? null : draft.id)}
                                            >
                                                <Download className="w-4 h-4" />
                                            </Button>
                                            {openDropdownId === draft.id && (
                                                <div className="absolute right-0 bottom-full mb-2 w-48 bg-background border border-border rounded-xl shadow-lg p-1 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
                                                    <button 
                                                        onClick={() => {
                                                            downloadDraft(draft);
                                                            setOpenDropdownId(null);
                                                        }} 
                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" /> Markdown (.md)
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            alert("PDF generation stub. Download .md and print to PDF for best results.");
                                                            setOpenDropdownId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2 opacity-60"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" /> PDF Document (.pdf)
                                                    </button>
                                                    <div className="h-px bg-border my-1" />
                                                    <button 
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(`${window.location.origin}/exports/${draft.id}`);
                                                            alert("Share link copied to clipboard");
                                                            setOpenDropdownId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                                                    >
                                                        <Download className="w-3.5 h-3.5" /> Copy Share Link
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Article Preview Drawer */}
            {viewingDraft && (
                <div className="w-[560px] shrink-0 border-l border-border/60 bg-background/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-right-4 duration-300">
                    <div className="h-14 flex items-center justify-between px-6 border-b border-border/60 shrink-0">
                        <h3 className="text-[13px] font-semibold tracking-tight truncate pr-4">{viewingDraft.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative dropdown-container">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setDrawerDropdownOpen(!drawerDropdownOpen)}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </Button>
                                {drawerDropdownOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-xl shadow-lg p-1 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                        <button 
                                            onClick={() => {
                                                downloadDraft(viewingDraft);
                                                setDrawerDropdownOpen(false);
                                            }} 
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <FileText className="w-3.5 h-3.5" /> Markdown (.md)
                                        </button>
                                        <div className="h-px bg-border my-1" />
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/exports/${viewingDraft.id}`);
                                                alert("Share link copied to clipboard");
                                                setDrawerDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <Download className="w-3.5 h-3.5" /> Copy Share Link
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setViewingDraft(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200" title="Close preview">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="mb-6 flex items-center gap-3">
                            <Badge>{viewingDraft.format}</Badge>
                            <Badge variant="secondary">{viewingDraft.wordCount} words</Badge>
                        </div>
                        <article className="prose prose-sm max-w-none">
                            {viewingDraft.content.split("\n").map((line, i) => {
                                if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold text-foreground mt-6 mb-3">{line.slice(2)}</h1>
                                if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-semibold text-foreground mt-5 mb-2">{line.slice(3)}</h2>
                                if (line.startsWith("### ")) return <h3 key={i} className="text-base font-semibold text-foreground mt-4 mb-1.5">{line.slice(4)}</h3>
                                if (line.startsWith("- ")) return <ul key={i}><li className="text-sm text-muted-foreground ml-4">{line.slice(2)}</li></ul>
                                if (line.startsWith("> ")) return <blockquote key={i} className="border-l-2 border-brand/30 pl-3 text-sm italic text-muted-foreground my-2">{line.slice(2)}</blockquote>
                                if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-sm font-semibold text-foreground my-2">{line.replace(/\*\*/g, "")}</p>
                                if (line.trim() === "") return <br key={i} />
                                return <p key={i} className="text-sm text-muted-foreground leading-relaxed my-2">{line}</p>
                            })}
                        </article>
                    </div>
                </div>
            )}
        </div>
    )
}

