"use client"
import { useState, useEffect, useCallback } from "react"

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
    Bold,
    Italic,
    List,
    Type,
    Quote,
    ChevronDown,
    FileText
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getFormatStyles } from "@/lib/format-styles"
import "../editor.css"
import DQMCard from "@/components/DQMCard"

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
    const { id } = useParams()
    const [draft, setDraft] = useState<Draft | null>(null)
    const [loading, setLoading] = useState(true)
    const [editedContent, setEditedContent] = useState("")
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [isQAing, setIsQAing] = useState(false)
    const [previewMode, setPreviewMode] = useState<"email" | "mobile" | "desktop">("email")
    const [exportOpen, setExportOpen] = useState(false)
    const [dqm, setDqm] = useState<DQMResult | null>(null)

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: "",
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'wysiwyg-editor min-h-[600px] text-foreground bg-transparent font-serif outline-none prose prose-slate dark:prose-invert max-w-none',
                    draft?.format && `editorial-${draft.format.toLowerCase().replace(/[\s\-_]+/g, '-')}`
                ),
            },
        },
        onUpdate: ({ editor }) => {
            setEditedContent(editor.getHTML())
        },
    })

    const handleQA = useCallback(async (targetId?: string) => {
        const sourceId = targetId || id
        setIsQAing(true)
        try {
            const res = await fetch("/api/drafts/evaluate", {
                method: "POST",
                body: JSON.stringify({ sourceId })
            })
            if (res.ok) {
                const data = await res.json()
                if (data.result) {
                    setDqm(data.result)
                    // Save to cache
                    localStorage.setItem(`dqm_${sourceId}`, JSON.stringify(data.result))
                }
            }
        } catch { /* fail */ }
        finally { setIsQAing(false) }
    }, [id])

    const normalizeMarkdown = (md: string) => {
        if (!md) return "";
        
        // Prepare: normalize line endings and ensure spacing
        const rawContent = md.replace(/\r\n/g, "\n").trim();
        const lines = rawContent.split('\n');
        
        let title = "";
        let startIndex = 0;

        // 1. Extract Title (First # line should be H1)
        if (lines[0].startsWith('# ')) {
            title = lines[0].replace(/^#\s+/, '').trim();
            startIndex = 1;
        }

        const normalizedHtml = [];

        // Add the single primary Title (H1) at the top
        if (title) {
            normalizedHtml.push(`<h1 class="editorial-title">${title}</h1>`);
        }

        let inList = false;

        for (let i = startIndex; i < lines.length; i++) {
            let line = lines[i].trim();
            
            if (!line) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                continue;
            }

            // Clean up raw symbols if they somehow persisted
            line = line.replace(/^\s*[#]+\s+/, (match) => {
                const level = match.trim().length;
                if (level === 1) return '<h2>'; // Downgrade misplaced H1 to H2
                if (level === 2) return '<h2>';
                return '<h3>';
            });
            
            // Handle headings that were already tagged or just converted
            if (line.startsWith('<h2>') || line.startsWith('<h3>')) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                const tag = line.startsWith('<h2>') ? 'h2' : 'h3';
                const content = line.replace(/<h[23]>/, '').replace(/<\/h[23]>/, '').trim();
                normalizedHtml.push(`<${tag}>${content}</${tag}>`);
                continue;
            }

            // Handle headings in Markdown style if regex didn't catch above
            if (line.startsWith('# ')) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                normalizedHtml.push(`<h2>${line.replace(/^#\s+/, '')}</h2>`);
                continue;
            }
            if (line.startsWith('## ')) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                normalizedHtml.push(`<h2>${line.replace(/^##\s+/, '')}</h2>`);
                continue;
            }
            if (line.startsWith('### ')) {
                if (inList) { normalizedHtml.push('</ul>'); inList = false; }
                normalizedHtml.push(`<h3>${line.replace(/^###\s+/, '')}</h3>`);
                continue;
            }

            // Handle Lists
            if (/^[\-\*\+] /.test(line)) {
                if (!inList) { normalizedHtml.push('<ul>'); inList = true; }
                normalizedHtml.push(`<li>${line.replace(/^[\-\*\+]\s+/, '').trim()}</li>`);
                continue;
            }

            // Handle Paragraphs and inline formatting
            if (inList) { normalizedHtml.push('</ul>'); inList = false; }
            
            const pContent = line
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            normalizedHtml.push(`<p>${pContent}</p>`);
        }

        if (inList) normalizedHtml.push('</ul>');

        return normalizedHtml.join('\n');
    };

    useEffect(() => {
        async function loadDraft() {
            try {
                const res = await fetch("/api/exports/list")
                if (!res.ok) return
                const data = await res.json()
                const found = (data.drafts || []).find((d: Draft) => d.id === id)
                if (found) {
                    setDraft(found)
                    
                    const contentToLoad = found.content.startsWith('<') ? found.content : normalizeMarkdown(found.content);
                    setEditedContent(contentToLoad)
                    
                    // Hydrate Tiptap
                    if (editor && contentToLoad) {
                        editor.commands.setContent(contentToLoad)
                    }
                    
                    // Check Cache first
                    const cached = localStorage.getItem(`dqm_${id}`)
                    if (cached) {
                        try {
                            setDqm(JSON.parse(cached))
                        } catch {
                            handleQA(id as string)
                        }
                    } else {
                        // Auto-trigger DQM analysis on load if NOT in cache
                        handleQA(id as string)
                    }
                }
            } catch { /* fail */ }
            finally { setLoading(false) }
        }
        loadDraft()
    }, [id, handleQA, editor])

    const handleBack = () => window.location.href = "/exports"

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        try {
            await fetch("/api/drafts/generate", {
                method: "POST",
                body: JSON.stringify({ source_id: id, force: true })
            })
            await new Promise(r => setTimeout(r, 3000))
            window.location.reload()
        } catch { /* fail */ }
        finally { setIsRegenerating(false) }
    }

    // Auto-save logic
    useEffect(() => {
        if (!editedContent || loading) return

        const timer = setTimeout(async () => {
            try {
                await fetch("/api/drafts/save", {
                    method: "POST",
                    body: JSON.stringify({ id, content: editedContent })
                })
            } catch (error) {
                console.error("Auto-save failed", error)
            }
        }, 2000)

        return () => clearTimeout(timer)
    }, [editedContent, id, loading])

    const handleDownload = (ext: string = "md") => {
        if (!draft) return
        const textToSave = editor?.getText() || editedContent
        // If content is HTML, strip tags for clean text download
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

    // Helper to strip HTML and Markdown for clean previews
    const getCleanExcerpt = (content: string, length: number = 200) => {
        if (!content) return "";
        // Strip HTML tags
        let text = content.replace(/<[^>]*>/g, " ");
        // Strip remaining markdown-ish tokens if any
        text = text.replace(/[#*>\-]/g, "");
        // Normalize whitespace
        text = text.replace(/\s+/g, " ").trim();
        return text.length > length ? text.slice(0, length) + "..." : text;
    };

    const draftExcerpt = getCleanExcerpt(editedContent, 250);
    const draftTitle = draft.title.replace(/<[^>]*>/g, "").trim();

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
            {/* Header */}
            <header className="h-14 border-b border-border/60 bg-background/80 backdrop-blur-md flex items-center justify-between px-6 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleBack}
                        title="Back to Exports"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="h-4 w-px bg-border/60" />
                    <div className="flex flex-col">
                        <h1 className="text-sm font-semibold tracking-tight truncate max-w-[400px]">
                            {draft.title}
                        </h1>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            Draft Studio
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 relative">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-xs gap-2 text-muted-foreground"
                        onClick={() => {
                            navigator.clipboard.writeText(editor?.getText() || editedContent)
                            alert("Copied to clipboard")
                        }}
                    >
                        <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                    <div className="relative">
                        <Button 
                            size="sm" 
                            className="h-8 text-xs gap-2 bg-black hover:bg-black/90 text-white pr-2"
                            onClick={() => setExportOpen(!exportOpen)}
                        >
                            <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                        {exportOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-background border border-border rounded-xl shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-200 z-[9999]">
                                <button 
                                    onClick={() => handleDownload("pdf")} 
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                >
                                    <FileText className="w-3.5 h-3.5 text-red-500 group-hover/item:scale-110 transition-transform" /> 
                                    <span>Portable Document (.pdf)</span>
                                </button>
                                <button 
                                    onClick={() => handleDownload("docx")} 
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                >
                                    <FileText className="w-3.5 h-3.5 text-blue-500 group-hover/item:scale-110 transition-transform" />
                                    <span>Word Document (.docx)</span>
                                </button>
                                <button 
                                    onClick={() => handleDownload("md")} 
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                >
                                    <FileText className="w-3.5 h-3.5 text-emerald-500 group-hover/item:scale-110 transition-transform" />
                                    <span>Markdown (.md)</span>
                                </button>
                                <button 
                                    onClick={() => handleDownload("txt")} 
                                    className="w-full text-left px-3 py-2 text-[11px] hover:bg-muted rounded-lg transition-colors flex items-center gap-2 group/item"
                                >
                                    <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover/item:scale-110 transition-transform" />
                                    <span>Plain Text (.txt)</span>
                                </button>
                                <div className="h-px bg-border/60 my-1 mx-1" />
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(editor?.getText() || editedContent)
                                        alert("Share link copied to clipboard")
                                        setExportOpen(false)
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
            </header>

            {/* main 3-panel core */}
            <main className="flex-1 flex overflow-hidden">
                {/* Left Panel: Preview/Context */}
                <aside className="w-[300px] border-r border-border/40 bg-muted/20 flex flex-col shrink-0 overflow-y-auto hidden xl:flex">
                    <div className="p-4 space-y-6">
                        <div>
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Context Preview</h3>
                            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg mb-4 border border-border/40 shadow-inner">
                                <button 
                                    onClick={() => setPreviewMode("email")}
                                    title="Email Preview"
                                    className={cn("flex-1 p-1.5 rounded-md flex justify-center transition-all", previewMode === "email" ? "bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/10" : "hover:bg-muted/50")}
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => setPreviewMode("mobile")}
                                    title="Mobile Preview"
                                    className={cn("flex-1 p-1.5 rounded-md flex justify-center transition-all", previewMode === "mobile" ? "bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/10" : "hover:bg-muted/50")}
                                >
                                    <Smartphone className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => setPreviewMode("desktop")}
                                    title="Desktop Preview"
                                    className={cn("flex-1 p-1.5 rounded-md flex justify-center transition-all", previewMode === "desktop" ? "bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/10" : "hover:bg-muted/50")}
                                >
                                    <Monitor className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {previewMode === "email" && (
                                <div className="border border-border/60 bg-card rounded-xl shadow-micro overflow-hidden flex flex-col h-[320px]">
                                    <div className="bg-muted/30 p-3 flex flex-col gap-1 border-b border-border/40 shrink-0">
                                        <div className="h-1.5 w-24 bg-muted/60 rounded" />
                                        <p className="text-[10px] font-bold truncate text-foreground">{draftTitle}</p>
                                    </div>
                                    <div className="p-4 space-y-3 overflow-hidden flex-1">
                                        <p className="text-[11px] text-muted-foreground/90 leading-relaxed font-serif">
                                            {draftExcerpt}
                                        </p>
                                        <div className="h-16 w-full bg-muted/5 rounded-lg border border-dashed border-border flex items-center justify-center mt-auto">
                                            <span className="text-[9px] text-muted-foreground/30 font-medium italic">Read full editorial...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {previewMode === "mobile" && (
                                <div className="mx-auto w-[200px] h-[400px] border-[6px] border-[#1a1a1a] rounded-[32px] bg-card relative overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                                    <div className="absolute top-0 w-full h-5 bg-[#1a1a1a] flex justify-center items-center">
                                        <div className="w-12 h-1 bg-white/20 rounded-full" />
                                    </div>
                                    <div className="p-5 pt-10 space-y-4">
                                        <div className="h-1.5 w-8 bg-brand/20 rounded-full" />
                                        <h4 className="text-[11px] font-bold leading-tight line-clamp-4 font-serif text-foreground">{draftTitle}</h4>
                                        <p className="text-[9px] text-muted-foreground/80 leading-relaxed font-serif">
                                            {getCleanExcerpt(editedContent, 300)}
                                        </p>
                                        <div className="space-y-1.5 pt-2">
                                            <div className="h-1.5 w-full bg-muted/20 rounded-full" />
                                            <div className="h-1.5 w-4/5 bg-muted/20 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {previewMode === "desktop" && (
                                <div className="border border-border/60 bg-card rounded-xl shadow-lg overflow-hidden flex flex-col h-[280px]">
                                    <div className="h-6 bg-muted/20 border-b border-border/40 flex items-center px-3 gap-1.5 shrink-0">
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400/40" />
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/40" />
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/40" />
                                        </div>
                                        <div className="mx-auto h-2.5 w-32 bg-white/60 rounded-full border border-border/20" />
                                    </div>
                                    <div className="p-5 py-3 space-y-2.5 flex-1 overflow-hidden">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <div className="w-4 h-4 rounded-full bg-muted/40" />
                                            <div className="h-1.5 w-16 bg-muted/40 rounded-full" />
                                        </div>
                                        <h4 className="text-[11px] font-bold line-clamp-2 leading-snug font-serif text-foreground">{draftTitle}</h4>
                                        <p className="text-[9px] text-muted-foreground/80 leading-relaxed font-serif">
                                            {getCleanExcerpt(editedContent, 400)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 pb-4 border-b border-border/40">
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Format Details</h3>
                            <div className="bg-card/60 p-[14px] rounded-xl border border-border/40 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">Type</span>
                                    {(() => {
                                        const styles = getFormatStyles(draft.format);
                                        return (
                                            <Badge 
                                                className={cn(
                                                    "gap-1 capitalize text-[10px] py-0 h-5 border shadow-none transition-none", 
                                                    styles.bg, 
                                                    styles.text, 
                                                    styles.border,
                                                    `hover:${styles.bg} hover:${styles.text} hover:${styles.border}`
                                                )}
                                            >
                                                <styles.icon className="w-3 h-3" />
                                                {draft.format}
                                            </Badge>
                                        );
                                    })()}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-muted-foreground">Length</span>
                                    <span className="text-xs font-semibold">{draft.wordCount} words</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs text-muted-foreground">Created</span>
                                    <span className="text-xs font-semibold">{new Date(draft.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Editorial Actions moved to Left Panel */}
                        <div className="pt-4">
                            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Editorial Actions</h3>
                            <div className="space-y-2">
                                <Button 
                                    variant="outline" 
                                    className="w-full justify-start gap-2 h-10 border-border/60 hover:border-brand/40 hover:bg-brand/5 text-[13px] font-medium transition-all"
                                    onClick={handleRegenerate}
                                    disabled={isRegenerating}
                                >
                                    <RefreshCcw className={cn("w-3.5 h-3.5", isRegenerating && "animate-spin")} />
                                    {isRegenerating ? "Regenerating..." : "Regenerate Full Draft"}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="w-full justify-start gap-2 h-10 border-border/60 hover:bg-muted/50 text-[13px] font-medium"
                                    onClick={() => alert("Sharing enabled soon")}
                                >
                                    <Share2 className="w-3.5 h-3.5" /> Share Work
                                </Button>
                                <Button 
                                    variant="outline" 
                                    className="w-full justify-start gap-2 h-10 border-border/60 hover:bg-muted/50 text-[13px] font-medium"
                                    onClick={() => handleQA()}
                                    disabled={isQAing}
                                >
                                    {isQAing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                    {isQAing ? "Analyzing..." : "Re-run QA Audit"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Center Panel: Editor */}
                <section className="flex-1 flex flex-col bg-background overflow-hidden relative">
                    {/* Floating Formatting Toolbar */}
                    <div className="h-10 border-b border-border/40 flex items-center justify-center px-4 shrink-0 bg-muted/5 gap-2 shadow-sm z-10">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8 hover:bg-muted", editor?.isActive('bold') && "bg-muted text-brand shadow-sm")} 
                            title="Bold"
                            onClick={() => editor?.chain().focus().toggleBold().run()}
                        >
                            <Bold className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8 hover:bg-muted", editor?.isActive('italic') && "bg-muted text-brand shadow-sm")} 
                            title="Italic"
                            onClick={() => editor?.chain().focus().toggleItalic().run()}
                        >
                            <Italic className="w-4 h-4" />
                        </Button>
                        <div className="w-px h-4 bg-border/60 mx-1" />
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8 hover:bg-muted", editor?.isActive('heading', { level: 1 }) && "bg-muted text-brand shadow-sm")} 
                            title="Header 1"
                            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                        >
                            <Type className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8 hover:bg-muted", editor?.isActive('blockquote') && "bg-white text-brand shadow-sm")} 
                            title="Quote"
                            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                        >
                            <Quote className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-8 w-8 hover:bg-muted", editor?.isActive('bulletList') && "bg-muted text-brand shadow-sm")} 
                            title="List"
                            onClick={() => editor?.chain().focus().toggleBulletList().run()}
                        >
                            <List className="w-4 h-4" />
                        </Button>
                        <div className="w-px h-4 bg-border/60 mx-1" />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8 max-w-[720px] mx-auto w-full">
                        <EditorContent editor={editor} />
                    </div>
                </section>

                {/* Right Panel: DQM Insights */}
                <aside className="w-[320px] border-l border-border/40 bg-muted/10 flex flex-col shrink-0 overflow-y-auto">
                    <div className="p-4">
                        <DQMCard 
                            dqm={dqm || undefined} 
                        />
                        <div className="h-px bg-border/40 my-6" />
                    </div>
                </aside>
            </main>
        </div>
    )
}
