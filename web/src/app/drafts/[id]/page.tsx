"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, Edit3, Target, Sparkles, Layout, Loader2, ArrowRight, FileText } from "lucide-react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"

export default function DraftStudioPage() {
    const params = useParams()
    const id = params?.id as string
    const router = useRouter()

    // Angle Strategist State
    const [strategy, setStrategy] = useState<any>(null)
    const [isStrategizing, setIsStrategizing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Article Architect State
    const [blueprint, setBlueprint] = useState<any>(null)
    const [isArchitecting, setIsArchitecting] = useState(false)
    const [architectError, setArchitectError] = useState<string | null>(null)

    // Writer State
    const [draft, setDraft] = useState<any>(null)
    const [isWriting, setIsWriting] = useState(false)
    const [writeError, setWriteError] = useState<string | null>(null)

    const handleStrategize = async () => {
        setIsStrategizing(true)
        setError(null)
        try {
            const res = await fetch("/api/angles/strategize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            if (data.result && data.result.payload) {
                setStrategy(data.result.payload)
            } else {
                throw new Error("Adapter did not return angle payload.")
            }

        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsStrategizing(false)
        }
    }

    const handleArchitect = async () => {
        setIsArchitecting(true)
        setArchitectError(null)
        try {
            const res = await fetch("/api/drafts/architect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            if (data.result && data.result.payload) {
                setBlueprint(data.result.payload)
            } else {
                throw new Error("Adapter did not return blueprint payload.")
            }

        } catch (err: any) {
            setArchitectError(err.message)
        } finally {
            setIsArchitecting(false)
        }
    }

    const handleWrite = async () => {
        setIsWriting(true)
        setWriteError(null)
        try {
            const res = await fetch("/api/drafts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            if (data.result && data.result.payload) {
                setDraft(data.result.payload)
            } else {
                throw new Error("Adapter did not return draft payload.")
            }

        } catch (err: any) {
            setWriteError(err.message)
        } finally {
            setIsWriting(false)
        }
    }

    if (!strategy) {
        return (
            <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">
                <div className="space-y-4">
                    <Link href={`/insights/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Insights
                    </Link>
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-serif font-semibold tracking-tight">Draft Studio</h1>
                        <Badge variant="outline">Angle Strategist</Badge>
                    </div>
                </div>

                {error && (
                    <div className="p-4 rounded-md bg-red-50 text-red-600 text-sm border border-red-200">
                        Error: {error}
                    </div>
                )}

                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Target className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Determine Editorial Angle</h3>
                    <p className="text-muted-foreground max-w-sm mb-6">
                        Invoke the LLM Angle Strategist to analyze the Extracted Insights and brainstorm target formats and distinct narrative angles.
                    </p>
                    <Button onClick={handleStrategize} disabled={isStrategizing} className="gap-2">
                        {isStrategizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isStrategizing ? "Strategizing..." : "Generate Angle Options"}
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="space-y-4">
                <Link href={`/insights/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Insights
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-serif font-semibold tracking-tight">Recommended Strategy</h1>
                        <p className="text-muted-foreground mt-1">Generated by Angle Strategist</p>
                    </div>
                    <Badge variant="success">Strategy Locked</Badge>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">

                <div className="md:col-span-2 space-y-6">
                    <Card className="border-brand bg-brand text-background">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2 font-serif text-background">
                                <Target className="w-5 h-5 text-yellow-400" /> Primary Framing Angle
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xl font-medium leading-relaxed text-zinc-100">
                                {strategy.framing_angle}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Working Titles</CardTitle>
                            <CardDescription>A/B test options for the final hook</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3">
                                {strategy.working_titles?.map((title: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                        <span className="text-brand shrink-0 mt-0.5 font-bold">{i + 1}.</span>
                                        <span className="font-medium">{title}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Strategic Rationale</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {strategy.rationale}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Distribution Formats</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            <div className="space-y-2">
                                <div className="text-xs font-bold text-brand uppercase tracking-wider mb-2">Recommended Main</div>
                                <div className="p-3 border rounded-md bg-muted/50 flex items-center gap-3">
                                    <Layout className="w-5 h-5 text-muted-foreground" />
                                    <span className="font-medium text-sm">{strategy.recommended_format}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Secondary Extensions</div>
                                {strategy.secondary_formats?.map((fmt: string, i: number) => (
                                    <div key={i} className="p-2 border rounded-md text-sm text-muted-foreground flex items-center justify-between">
                                        {fmt}
                                    </div>
                                ))}
                            </div>

                        </CardContent>
                    </Card>

                    <Card className="border-brand/30 shadow-sm">
                        <CardHeader>
                            <CardTitle>Article Architect</CardTitle>
                            <CardDescription>Map out the narrative beats and requirements before drafting.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                className="w-full gap-2"
                                variant={blueprint ? "outline" : "default"}
                                onClick={handleArchitect}
                                disabled={isArchitecting || !!blueprint}
                            >
                                {isArchitecting ? <Loader2 className="w-4 h-4 animate-spin" /> : (blueprint ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Edit3 className="w-4 h-4" />)}
                                {isArchitecting ? "Architecting..." : (blueprint ? "Blueprint Locked" : "Generate Blueprint")}
                            </Button>

                            {architectError && (
                                <p className="text-red-500 text-xs mt-3">{architectError}</p>
                            )}
                        </CardContent>
                    </Card>

                </div>
            </div>

            {blueprint && (
                <div className="pt-8 border-t space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-serif font-semibold tracking-tight text-foreground">Structural Blueprint</h2>
                        <Badge variant="outline" className="font-mono">{blueprint.total_word_count_target} Words Target</Badge>
                    </div>

                    <div className="grid gap-4">
                        {blueprint.sections?.map((section: any, idx: number) => (
                            <Card key={idx}>
                                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                                        {section.heading}
                                    </CardTitle>
                                    <Badge variant="secondary" className="font-mono shrink-0">{section.word_count_target} w</Badge>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-foreground/80 font-medium italic">Role: {section.purpose}</p>
                                    <ul className="space-y-2">
                                        {section.key_points?.map((kp: string, k: number) => (
                                            <li key={k} className="flex gap-2 text-sm text-muted-foreground">
                                                <span className="text-brand/50 mt-0.5">•</span>
                                                <span>{kp}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex justify-end pt-4">
                        <div className="flex flex-col items-end gap-2">
                            <Button
                                size="lg"
                                className="gap-2 bg-brand hover:bg-brand/90 text-background"
                                onClick={handleWrite}
                                disabled={isWriting || !!draft}
                            >
                                {isWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                {isWriting ? "Drafting..." : "Call Writer Agent"} {(!isWriting && !draft) && <ArrowRight className="w-4 h-4 ml-1 opacity-50" />}
                            </Button>
                            {writeError && <p className="text-red-500 text-xs">{writeError}</p>}
                        </div>
                    </div>
                </div>
            )}

            {draft && (
                <div className="pt-8 border-t space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-serif font-semibold tracking-tight text-foreground">Generated Draft</h2>
                            <p className="text-muted-foreground mt-1">Ready for Review and Export</p>
                        </div>
                        <Button variant="default" className="bg-green-600 hover:bg-green-700">
                            <Link href={`/reviews/${id}`}>Proceed to QA</Link>
                        </Button>
                    </div>

                    <Card className="border-border">
                        <CardHeader className="border-b bg-muted/20">
                            <CardTitle className="font-serif text-xl">{draft.title}</CardTitle>
                            <CardDescription>{draft.word_count} Words</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 prose prose-zinc max-w-none">
                            <div className="whitespace-pre-wrap font-serif text-foreground/90 leading-relaxed">
                                {draft.content}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

        </div>
    )
}

function CheckCircle2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    )
}
