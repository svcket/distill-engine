"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { 
    ArrowLeft, 
    Download, 
    Loader2, 
    RefreshCcw, 
    ShieldCheck, 
    Share2, 
    Mail, 
    Copy,
    ChevronLeft,
    Smartphone,
    Monitor,
    Bold as BoldIcon,
    Italic as ItalicIcon,
    List as ListIcon,
    Type,
    ChevronDown,
    FileText as FileIcon,
    Check
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getFormatStyles } from "@/lib/format-styles"
import "../editor.css"
import DQMCard from "@/components/DQMCard"
import { useLanguage } from "@/context/LanguageContext"
import { PublishDropdown } from "@/components/features/PublishDropdown"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/DropdownMenu"

interface Draft {
    id: string
    title: string
    content: string
    wordCount: number
    format: string
    status: string
    createdAt: string
}

interface DQMResult {
    scores: {
        publishability: number
        seo: number
        aeo: number
        source_grounding: number
        insight_density: number
        humanness: number
        clarity: number
        structure: number
    }
    strengths?: string[]
    risks?: string[]
    suggestions?: string[]
    rationale?: string
}

export default function DraftWorkspacePage() {
    const { t } = useLanguage()
    const { id } = useParams()
    const [draft, setDraft] = useState<Draft | null>(null)
    const [loading, setLoading] = useState(true)
    const [editedContent, setEditedContent] = useState("")
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isQAing, setIsQAing] = useState(false)
    const [isPublishing, setIsPublishing] = useState(false)
    const [previewMode, setPreviewMode] = useState<"email" | "mobile" | "desktop">("email")
    const [exportOpen, setExportOpen] = useState(false)
    const [dqm, setDqm] = useState<DQMResult | null>(null)
    const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const [regenTone, setRegenTone] = useState("professional")
    const [regenIntent, setRegenIntent] = useState("blog_article")

    // Use a ref to track if we've already tried to fetch results to prevent loops
    const initialFetched = useRef(false)

    const fetchDQM = useCallback(async (sourceId: string) => {
        try {
            const res = await fetch(`/api/store/results?sourceId=${sourceId}`)
            if (res.ok) {
                const data = await res.json()
                const qaRaw = data.results?.qa || data.qa
                if (qaRaw) {
                    const normalized = qaRaw.payload || qaRaw.data || qaRaw
                    setDqm(normalized)
                    localStorage.setItem(`dqm_${sourceId}`, JSON.stringify(normalized))
                    return true
                }
            }
        } catch (e) {
            console.error("Score hydration failed", e)
        }
        return false
    }, [])

    const handleQA = useCallback(async (targetId?: string) => {
        const sourceId = targetId || resolvedSourceId || id
        setIsQAing(true)
        try {
            const res = await fetch("/api/drafts/evaluate", {
                method: "POST",
                body: JSON.stringify({ sourceId, draftContent: editedContent })
            })
            if (res.ok) {
                const data = await res.json()
                const result = data.result?.payload || data.result?.data || data.result
                if (result) {
                    setDqm(result)
                    localStorage.setItem(`dqm_${sourceId}`, JSON.stringify(result))
                }
            }
        } catch { /* fail */ }
        finally { setIsQAing(false) }
    }, [id, resolvedSourceId, editedContent])

    const normalizeMarkdown = (md: string) => {
        if (!md) return "";
        const rawContent = md.replace(/\r\n/g, "\n").trim();
        const lines = rawContent.split('\n');
        
        let title = "";
        let startIndex = 0;
        if (lines[0].startsWith('# ')) {
            title = lines[0].replace(/^#\s+/, '').trim();
            startIndex = 1;
        }
        const normalizedHtml = [];
        if (title) normalizedHtml.push(`<h1 class="editorial-title">${title}</h1>`);
        let inList = false;
        for (let i = startIndex; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                continue;
            }
            line = line.replace(/^\s*[#]+\s+/, (match) => {
                const level = match.trim().length;
                if (level === 1) return '<h2>';
                if (level === 2) return '<h2>';
                return '<h3>';
            });
            if (line.startsWith('<h2>') || line.startsWith('<h3>')) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                const tag = line.startsWith('<h2>') ? 'h2' : 'h3';
                const content = line.replace(/<h[23]>/, '').replace(/<\/h[23]>/, '').trim();
                normalizedHtml.push(`<${tag}>${content}</${tag}>`);
                continue;
            }
            if (/^[\-\*\+] /.test(line)) {
                if (!inList) { normalizedHtml.push('<ul>'); inList = true; }
                normalizedHtml.push(`<li>${line.replace(/^[\-\*\+]\s+/, '').trim()}</li>`);
                continue;
            }
            if (inList) { normalizedHtml.push('</ul>'); inList = false; }
            const pContent = line
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            normalizedHtml.push(`<p>${pContent}</p>`);
        }
        if (inList) normalizedHtml.push('</ul>');
        return normalizedHtml.join('\n');
    };

    const editor = useEditor({
        extensions: [StarterKit],
        content: "",
        immediatelyRender: true,
        editorProps: {
            attributes: {
                class: cn(
                    'wysiwyg-editor min-h-[600px] text-foreground bg-transparent font-serif outline-none prose prose-slate dark:prose-invert max-w-none cursor-text',
                    draft?.format && `editorial-${draft.format.toLowerCase().replace(/[\s\-_]+/g, '-')}`
                ),
            },
        },
        onUpdate: ({ editor }) => setEditedContent(editor.getHTML()),
    })

    useEffect(() => {
        if (initialFetched.current) return
        
        async function loadDraft() {
            try {
                const listRes = await fetch("/api/exports/list")
                const sourcesRes = await fetch("/api/store")
                
                if (!listRes.ok || !sourcesRes.ok) return
                
                const { drafts } = await listRes.json()
                const { sources } = await sourcesRes.json()
                
                const foundDraft = drafts.find((d: Draft) => d.id === id)
                if (foundDraft) {
                    setDraft(foundDraft)
                    const contentToLoad = foundDraft.content.startsWith('<') ? foundDraft.content : normalizeMarkdown(foundDraft.content);
                    setEditedContent(contentToLoad)
                    if (editor) editor.commands.setContent(contentToLoad)

                    const foundSource = sources.find((s: any) => s.title && s.title.trim() === foundDraft.title.trim())
                    const sourceId = foundSource?.id || id
                    setResolvedSourceId(sourceId)

                    const cached = localStorage.getItem(`dqm_${sourceId}`)
                    if (cached) {
                        setDqm(JSON.parse(cached))
                    } else {
                        const success = await fetchDQM(sourceId as string)
                        if (!success) {
                            handleQA(sourceId as string)
                        }
                    }
                }
            } catch { /* fail */ }
            finally { 
                setLoading(false)
                initialFetched.current = true
            }
        }
        loadDraft()
    }, [id, editor, fetchDQM, handleQA])

    const handleBack = () => window.location.href = "/exports"

    const handleCopy = async () => {
        if (!editor) return
        try {
            const html = editor.getHTML()
            const text = editor.getText()

            const blobHtml = new Blob([html], { type: "text/html" })
            const blobText = new Blob([text], { type: "text/plain" })

            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": blobHtml,
                    "text/plain": blobText,
                })
            ])
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Rich text copy failed, falling back to plain text", err)
            navigator.clipboard.writeText(editor.getText())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handlePublish = async (platform: string) => {
        if (!resolvedSourceId || !editedContent) return
        setIsPublishing(true)
        try {
            const res = await fetch("/api/publish", {
                method: "POST",
                body: JSON.stringify({
                    sourceId: resolvedSourceId,
                    platform,
                    content: editedContent
                })
            })
            const data = await res.json()
            if (res.ok) {
                alert(data.message || `Successfully pushed to ${platform}.`)
            } else {
                alert(`Publishing failed: ${data.error || "Unknown error"}`)
            }
        } catch (err) {
            console.error("Publishing error:", err)
            alert("An error occurred while publishing.")
        } finally {
            setIsPublishing(false)
            setExportOpen(false)
        }
    }

    const handleRegenerate = async () => {
        if (!resolvedSourceId) return
        setIsRegenerating(true)
        try {
            const res = await fetch("/api/drafts/generate", {
                method: "POST",
                body: JSON.stringify({ 
                    transcriptId: resolvedSourceId,
                    draftId: id,
                    tone: regenTone,
                    type: regenIntent,
                    force: true,
                    stream: false 
                })
            })
            if (res.ok) {
                const data = await res.json()
                const newContentAt = data.result?.content || data.result
                if (newContentAt) {
                    const formatted = newContentAt.startsWith('<') ? newContentAt : normalizeMarkdown(newContentAt)
                    editor?.commands.setContent(formatted)
                    setEditedContent(formatted)
                    handleQA(resolvedSourceId)
                }
            }
        } catch { /* fail */ }
        finally { setIsRegenerating(false) }
    }

    useEffect(() => {
        if (!editedContent || loading) return
        const timer = setTimeout(async () => {
            try {
                await fetch("/api/drafts/save", {
                    method: "POST",
                    body: JSON.stringify({ id, content: editedContent })
                })
            } catch (error) { console.error("Auto-save failed", error) }
        }, 2000)
        return () => clearTimeout(timer)
    }, [editedContent, id, loading])

    const handleDownload = (ext: string = "md") => {
        if (!draft) return
        const textToSave = editor?.getText() || editedContent
        const cleanText = textToSave.replace(/<[^>]*>/g, "").trim()
        const blob = new Blob([cleanText], { type: ext === "md" ? "text/markdown" : "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${draft.id}_refined.${ext}`
        a.click()
        URL.revokeObjectURL(url)
        setExportOpen(false)
    }

    if (loading) return (
        <div className="flex h-full items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    if (!draft) return (
        <div className="flex h-full flex-col items-center justify-center space-y-4">
            <p className="text-muted-foreground font-serif text-lg">Draft not found</p>
            <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to exports
            </Button>
        </div>
    )

    const getCleanExcerpt = (content: string, length: number = 200) => {
        if (!content) return "";
        let text = content.replace(/<[^>]*>/g, " ");
        text = text.replace(/[#*>\-]/g, "");
        text = text.replace(/\s+/g, " ").trim();
        return text.length > length ? text.slice(0, length) + "..." : text;
    };

    const draftExcerpt = getCleanExcerpt(editedContent, 250);
    const draftTitle = draft.title.replace(/<[^>]*>/g, "").trim();

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            {/* Header */}
            <header className="h-14 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6 z-20 shrink-0">
                <div className="flex items-center gap-2 lg:gap-4 truncate">
                    <button 
                        onClick={handleBack}
                        title="Back to Exports"
                        className="p-1 lg:p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    >
                        <ChevronLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                    </button>
                    <div className="h-4 w-px bg-border/60 shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <h1 className="text-xs lg:text-sm font-semibold tracking-tight truncate max-w-[120px] lg:max-w-[400px]">
                            {draft.title}
                        </h1>
                        <span className="text-[8px] lg:text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            Studio
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 lg:gap-2 relative shrink-0">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className={cn("h-7 lg:h-8 text-[10px] lg:text-xs px-2 lg:px-3 gap-1.5 lg:gap-2 transition-all", copied ? "text-emerald-500" : "text-muted-foreground font-bold")}
                        onClick={handleCopy}
                    >
                        {copied ? (
                            <><Check className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Copied!</>
                        ) : (
                            <><Copy className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> <span className="hidden sm:inline">{t("copy")}</span></>
                        )}
                    </Button>
                    <div className="relative">
                        <Button 
                            variant="outline"
                            size="sm" 
                            className="h-7 lg:h-8 text-[10px] lg:text-[12px] font-bold px-2 lg:px-4 rounded-full border border-border/40 bg-zinc-900/5 dark:bg-zinc-100/10 text-foreground hover:bg-zinc-900/10 dark:hover:bg-zinc-100/20 transition-all gap-1.5 lg:gap-2"
                            onClick={() => setExportOpen(!exportOpen)}
                        >
                            <Download className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> <span className="hidden sm:inline">{t("export")}</span>
                        </Button>
                        {exportOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-background border border-border rounded-xl shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 z-[9999]">
                                <button onClick={() => handleDownload("pdf")} className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item">
                                    <FileIcon className="w-3.5 h-3.5 text-red-500 group-hover/item:scale-110 transition-transform" /> <span>Portable Document (.pdf)</span>
                                </button>
                                <button onClick={() => handleDownload("docx")} className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item">
                                    <FileIcon className="w-3.5 h-3.5 text-blue-500 group-hover/item:scale-110 transition-transform" /> <span>Word Document (.docx)</span>
                                </button>
                                <button onClick={() => handleDownload("md")} className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item">
                                    <FileIcon className="w-3.5 h-3.5 text-emerald-500 group-hover/item:scale-110 transition-transform" /> <span>Markdown (.md)</span>
                                </button>
                                <div className="h-px bg-border/60 my-1 mx-1" />
                                <PublishDropdown 
                                    type="draft_studio"
                                    isPublishing={isPublishing}
                                    onPublish={handlePublish}
                                    trigger={
                                        <button className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item">
                                            <Share2 className="w-3.5 h-3.5 text-amber-500 group-hover/item:scale-110 transition-transform" /> <span>Share Work</span>
                                        </button>
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden">
                <aside className="w-[300px] border-r border-border/40 bg-muted/20 flex flex-col shrink-0 overflow-y-auto hidden xl:flex">
                    <div className="p-4 space-y-6">
                        <div>
                        <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Context Preview</h3>
                            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg mb-6 border border-border/10">
                                <button onClick={() => setPreviewMode("email")} className={cn("flex-1 p-2 rounded-md flex justify-center transition-all", previewMode === "email" ? "bg-background shadow-md" : "hover:bg-muted/50")}>
                                    <Mail className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setPreviewMode("mobile")} className={cn("flex-1 p-2 rounded-md flex justify-center transition-all", previewMode === "mobile" ? "bg-background shadow-md" : "hover:bg-muted/50")}>
                                    <Smartphone className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setPreviewMode("desktop")} className={cn("flex-1 p-2 rounded-md flex justify-center transition-all", previewMode === "desktop" ? "bg-background shadow-md" : "hover:bg-muted/50")}>
                                    <Monitor className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            
                            <div className="flex justify-center h-[380px] perspective-[1000px]">
                                {previewMode === "email" && (
                                    <div className="w-full bg-card border border-border/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-500">
                                        <div className="p-3 border-b border-border/40 bg-muted/30">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[10px] font-bold">D</div>
                                                <div className="text-[10px]"><span className="text-muted-foreground font-medium">From:</span> <span className="font-bold">Distill Editor</span></div>
                                            </div>
                                            <div className="text-[10px] font-bold truncate">Subject: {draft.title}</div>
                                        </div>
                                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-background">
                                            <h4 className="text-[11px] font-bold mb-2 font-serif">{draft.title}</h4>
                                            <p className="text-[10px] text-muted-foreground leading-relaxed font-serif">{draftExcerpt}</p>
                                        </div>
                                    </div>
                                )}

                                {previewMode === "mobile" && (
                                    <div className="w-[180px] h-[360px] border-[6px] border-[#1a1a1b] rounded-[36px] bg-[#1a1a1b] relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-500">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-[#1a1a1b] rounded-b-xl z-20 flex items-center justify-center">
                                            <div className="w-8 h-1 bg-white/10 rounded-full" />
                                        </div>
                                        <div className="absolute inset-0 bg-background m-0.5 rounded-[30px] overflow-hidden flex flex-col">
                                            <div className="h-8 bg-muted/20 border-b border-border/10" />
                                            <div className="p-4 pt-6 overflow-y-auto custom-scrollbar no-scrollbar text-left">
                                                <h4 className="text-[9px] font-bold leading-tight mb-2 font-serif text-foreground line-clamp-2">{draftTitle}</h4>
                                                <p className="text-[8px] text-muted-foreground/90 leading-relaxed font-serif">{getCleanExcerpt(editedContent, 500)}</p>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded-full z-20" />
                                    </div>
                                )}

                                {previewMode === "desktop" && (
                                    <div className="w-full bg-background border border-border/40 rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col animate-in slide-in-from-top-4 duration-500">
                                        <div className="h-6 bg-muted/40 border-b border-border/40 flex items-center px-2 gap-1.5">
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-400/50" />
                                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/50" />
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                                            </div>
                                            <div className="flex-1 max-w-[120px] h-3.5 bg-background/50 rounded-md border border-border/20 mx-auto" />
                                        </div>
                                        <div className="flex-1 p-5 py-4 overflow-y-auto custom-scrollbar bg-background">
                                            <h4 className="text-[12px] font-bold mb-3 font-serif line-clamp-2">{draftTitle}</h4>
                                            <p className="text-[9px] text-muted-foreground leading-relaxed font-serif">{getCleanExcerpt(editedContent, 600)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 pb-4 border-b border-border/40">
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Format Details</h3>
                            <div className="bg-card/60 p-[14px] rounded-xl border border-border/40 space-y-3">
                                <div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">Type</span>
                                    {(() => {
                                        const styles = getFormatStyles(draft.format);
                                        return <Badge className={cn("gap-1 capitalize text-[10px] py-0 h-5 border shadow-none transition-none", styles.bg, styles.text, styles.border)}><styles.icon className="w-3 h-3" />{draft.format}</Badge>;
                                    })()}
                                </div>
                                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Length</span><span className="text-xs font-semibold">{draft.wordCount} words</span></div>
                                <div className="flex justify-between"><span className="text-xs text-muted-foreground">Created</span><span className="text-xs font-semibold">{new Date(draft.createdAt).toLocaleDateString()}</span></div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Regeneration Options</h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground/60 uppercase">Tone & Voice</label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger>
                                            <Button variant="outline" className="w-full justify-between h-9 text-xs">
                                                {regenTone.charAt(0).toUpperCase() + regenTone.slice(1)} <ChevronDown className="w-3 h-3 ml-2 opacity-60" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuRadioGroup value={regenTone} onValueChange={setRegenTone}>
                                                <DropdownMenuRadioItem value="professional">Professional</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="witty">Witty & Sharp</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="academic">Academic</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="bold">Bold & Provocative</DropdownMenuRadioItem>
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-muted-foreground/60 uppercase">Content Intent</label>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger>
                                            <Button variant="outline" className="w-full justify-between h-9 text-xs">
                                                {regenIntent.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())} <ChevronDown className="w-3 h-3 ml-2 opacity-60" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuRadioGroup value={regenIntent} onValueChange={setRegenIntent}>
                                                <DropdownMenuRadioItem value="blog_article">Blog Article</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="essay">Thematic Essay</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="technical_breakdown">Technical Breakdown</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="explainer">Explainer</DropdownMenuRadioItem>
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <Button 
                                    className="w-full justify-center gap-2 h-10 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black hover:opacity-90 transition-all font-bold"
                                    onClick={handleRegenerate}
                                    disabled={isRegenerating || !resolvedSourceId}
                                >
                                    {isRegenerating ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                                    {isRegenerating ? "Rewriting..." : "Regenerate Full Draft"}
                                </Button>
                            </div>

                            <div className="mt-8 pt-4 border-t border-border/40">
                                <Button 
                                    variant="outline" 
                                    className="w-full justify-start gap-2 h-10 border-border/60 hover:bg-muted/50 text-[13px] font-medium"
                                    onClick={() => handleQA()}
                                    disabled={isQAing}
                                >
                                    {isQAing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                    {isQAing ? "Analyzing Matrix..." : "Re-run Quality Audit"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </aside>

                <section className="flex-1 flex flex-col bg-background overflow-hidden relative">
                    <div className="h-10 border-b border-border/40 flex items-center justify-center px-4 shrink-0 bg-muted/5 gap-1 lg:gap-2 shadow-sm z-10 overflow-x-auto no-scrollbar">
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 shrink-0", editor?.isActive('bold') && "text-brand")} onClick={() => editor?.chain().focus().toggleBold().run()}><BoldIcon className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 shrink-0", editor?.isActive('italic') && "text-brand")} onClick={() => editor?.chain().focus().toggleItalic().run()}><ItalicIcon className="w-4 h-4" /></Button>
                        <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 shrink-0", editor?.isActive('heading', { level: 2 }) && "text-brand")} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Type className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className={cn("h-8 w-8 shrink-0", editor?.isActive('bulletList') && "text-brand")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><ListIcon className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-6 lg:py-8 max-w-[720px] mx-auto w-full">
                        <EditorContent editor={editor} />
                    </div>
                </section>

                <aside className="w-[320px] border-l border-border/40 bg-muted/10 flex flex-col shrink-0 overflow-y-auto hidden 2xl:flex">
                    <div className="p-4">
                        <DQMCard dqm={dqm || undefined} />
                    </div>
                </aside>
            </main>
        </div>
    )
}
