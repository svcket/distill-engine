"use client"
import { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Download, FileText, Eye, Loader2, Copy } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getFormatStyles } from "@/lib/format-styles"

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
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

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
            if (openDropdownId) {
                const target = e.target as HTMLElement
                if (!target.closest('.dropdown-container')) {
                    setOpenDropdownId(null)
                }
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [openDropdownId])

    const downloadDraft = (draft: Draft, ext: string = "md") => {
        const content = ext === "md" ? `# ${draft.title}\n\n${draft.content}` : draft.content;
        const type = ext === "pdf" ? "application/pdf" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "md" ? "text/markdown" : "text/plain";
        const blob = new Blob([content], { type })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${draft.id}_draft.${ext}`
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
        <div className="flex h-full overflow-y-auto">
            <div className="flex-1">
                <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
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
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {drafts.map(draft => (
                                <Link key={draft.id} href={`/exports/${draft.id}`} className="flex flex-col group hover:shadow-soft hover:border-gray-300 transition-all duration-200 bg-card border border-border rounded-xl shadow-sm">
                                    <div className="p-4 flex flex-col h-full">
                                        <div className="flex justify-between items-start mb-2">
                                            {(() => {
                                                const styles = getFormatStyles(draft.format);
                                                return (
                                                    <Badge 
                                                        className={cn(
                                                            "gap-1 capitalize text-[10px] py-0 h-5 border shadow-none transition-none", 
                                                            styles.bg, 
                                                            styles.text, 
                                                            styles.border,
                                                            // Explicitly override hover colors to match default
                                                            `hover:${styles.bg} hover:${styles.text} hover:${styles.border}`
                                                        )}
                                                    >
                                                        <styles.icon className="w-3 h-3" />
                                                        {draft.format}
                                                    </Badge>
                                                );
                                            })()}
                                            <span className="text-[10px] font-medium text-muted-foreground">{timeAgo(draft.createdAt)}</span>
                                        </div>
                                        <h3 className="text-base leading-tight font-serif font-semibold line-clamp-2 mb-1">{draft.title}</h3>
                                        <p className="text-[10px] uppercase tracking-wider font-medium opacity-60 mb-2">{draft.wordCount} words</p>
                                        
                                        <div className="flex-1">
                                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed opacity-80">
                                                {draft.content.replace(/<[^>]*>/g, "").trim().slice(0, 150)}...
                                            </p>
                                        </div>
                                        
                                         <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                                             <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase">
                                                 <span>View Draft</span>
                                                 <Eye className="w-3 h-3" />
                                             </div>
                                             <div className="flex items-center gap-1">
                                                 <Button
                                                     variant="ghost"
                                                     size="icon"
                                                     className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                     title="Copy Draft"
                                                     onClick={(e) => {
                                                         e.preventDefault();
                                                         e.stopPropagation();
                                                         navigator.clipboard.writeText(draft.content);
                                                         alert("Draft content copied");
                                                     }}
                                                 >
                                                     <Copy className="w-3.5 h-3.5" />
                                                 </Button>
                                                 <div className="relative dropdown-container" onClick={(e) => {
                                                     e.preventDefault();
                                                     e.stopPropagation();
                                                 }}>
                                                     <Button
                                                         variant="ghost"
                                                         size="icon"
                                                         className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                         title="Download options"
                                                         onClick={(e) => {
                                                             e.preventDefault();
                                                             e.stopPropagation();
                                                             setOpenDropdownId(openDropdownId === draft.id ? null : draft.id);
                                                         }}
                                                     >
                                                         <Download className="w-3.5 h-3.5" />
                                                     </Button>
                                                     {openDropdownId === draft.id && (
                                                         <div className="fixed sm:absolute right-[20px] sm:right-0 mt-2 w-52 bg-background border border-border rounded-xl shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 z-[100]" onClick={(e) => e.stopPropagation()}>
                                                             <button 
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     downloadDraft(draft, "pdf");
                                                                     setOpenDropdownId(null);
                                                                 }} 
                                                                 className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                                             >
                                                                 <FileText className="w-3.5 h-3.5 text-red-500 group-hover/item:scale-110 transition-transform" /> 
                                                                 <span>Portable Document (.pdf)</span>
                                                             </button>
                                                             <button 
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     downloadDraft(draft, "docx");
                                                                     setOpenDropdownId(null);
                                                                 }} 
                                                                 className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                                             >
                                                                 <FileText className="w-3.5 h-3.5 text-blue-500 group-hover/item:scale-110 transition-transform" />
                                                                 <span>Word Document (.docx)</span>
                                                             </button>
                                                             <button 
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     downloadDraft(draft, "md");
                                                                     setOpenDropdownId(null);
                                                                 }} 
                                                                 className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                                             >
                                                                 <FileText className="w-3.5 h-3.5 text-emerald-500 group-hover/item:scale-110 transition-transform" />
                                                                 <span>Markdown (.md)</span>
                                                             </button>
                                                             <button 
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     downloadDraft(draft, "txt");
                                                                     setOpenDropdownId(null);
                                                                 }} 
                                                                 className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                                             >
                                                                 <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover/item:scale-110 transition-transform" />
                                                                 <span>Plain Text (.txt)</span>
                                                             </button>
                                                             <div className="h-px bg-border/60 my-1 mx-1" />
                                                             <button 
                                                                 onClick={(e) => {
                                                                     e.preventDefault();
                                                                     e.stopPropagation();
                                                                     navigator.clipboard.writeText(`${window.location.origin}/exports/${draft.id}`);
                                                                     alert("Share link copied to clipboard");
                                                                     setOpenDropdownId(null);
                                                                 }}
                                                                 className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                                             >
                                                                 <Copy className="w-3.5 h-3.5 text-amber-500 group-hover/item:scale-110 transition-transform" />
                                                                 <span>Copy Share Link</span>
                                                             </button>
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>
                                         </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
