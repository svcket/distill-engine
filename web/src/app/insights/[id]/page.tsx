"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, Lightbulb, MessageSquareQuote, Zap, Loader2, Play, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function InsightsPage() {
    const params = useParams()
    const id = params?.id as string

    const [insights, setInsights] = useState<any>(null)
    const [isExtracting, setIsExtracting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleExtract = async () => {
        setIsExtracting(true)
        setError(null)
        try {
            const res = await fetch("/api/insights/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            // The python script writes to `.tmp/insights/`, but next.js API could return it directly
            // For now, we'll fetch the generated JSON via a generic file read API or from `data.result`
            // Wait, our API route didn't return the payload body, let's just trigger it and hope the adapter can read it later
            // Actually, we should update the adapter to return the payload.

            // Assuming the adapter returns the full json object for the UI
            if (data.result && data.result.payload) {
                setInsights(data.result.payload)
            } else {
                throw new Error("Adapter did not return insight payload.")
            }

        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsExtracting(false)
        }
    }

    if (!insights) {
        return (
            <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">
                <div className="space-y-4">
                    <Link href={`/sources/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Source
                    </Link>
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-serif font-semibold tracking-tight">Extract Insights</h1>
                        <Badge variant="outline">LLM Extraction</Badge>
                    </div>
                </div>

                {error && (
                    <div className="p-4 rounded-md bg-red-50 text-red-600 text-sm border border-red-200">
                        Error: {error}
                    </div>
                )}

                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Zap className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No Insights Yet</h3>
                    <p className="text-muted-foreground max-w-sm mb-6">
                        Run the Insight Extractor to analyze the chunked transcripts and pull out theses, frameworks, and quotes.
                    </p>
                    <Button onClick={handleExtract} disabled={isExtracting} className="gap-2">
                        {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {isExtracting ? "Extracting..." : "Process with LLM"}
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="space-y-4">
                <Link href={`/sources/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Source
                </Link>
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-serif font-semibold tracking-tight">Extracted Insights</h1>
                    <div className="flex gap-2">
                        <Badge variant="secondary">Confidence: {insights.confidence_notes ? "Normal" : "Low"}</Badge>
                        <Badge>Knowledge Packet</Badge>
                    </div>
                </div>
                {insights.confidence_notes && (
                    <p className="text-sm text-muted-foreground italic bg-muted p-3 rounded-md border">
                        System Note: {insights.confidence_notes}
                    </p>
                )}
            </div>

            <Card className="border-brand bg-brand text-background">
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2 font-serif text-background">
                        <Lightbulb className="w-5 h-5 text-yellow-400" /> Core Thesis
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-lg leading-relaxed text-zinc-200">
                        {insights.thesis}
                    </p>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">

                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-brand" /> Frameworks & Models
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {insights.frameworks?.map((fw: any, i: number) => (
                            <div key={i} className="space-y-1">
                                <h4 className="font-medium">{fw.title}</h4>
                                <p className="text-sm text-muted-foreground leading-relaxed">{fw.description}</p>
                            </div>
                        ))}
                        {(!insights.frameworks || insights.frameworks.length === 0) && (
                            <p className="text-sm text-muted-foreground italic">No strict frameworks detected.</p>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquareQuote className="w-4 h-4 text-brand" /> Quote Candidates
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {insights.quotes?.map((quote: string, i: number) => (
                                <blockquote key={i} className="pl-4 border-l-2 border-brand/20 text-sm font-serif italic text-muted-foreground">
                                    &ldquo;{quote}&rdquo;
                                </blockquote>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-brand" /> Practical Takeaways
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3">
                                {insights.takeaways?.map((takeaway: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                                        <span className="text-brand shrink-0 mt-0.5">•</span>
                                        <span>{takeaway}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </div>

            </div>

            <div className="flex justify-end pt-4 mt-8 border-t border-border">
                <Link href={`/drafts/${id}`}>
                    <Button size="lg" className="gap-2 bg-brand hover:bg-brand/90 text-background">
                        Proceed to Draft Studio <ArrowRight className="w-4 h-4 ml-1 opacity-50" />
                    </Button>
                </Link>
            </div>

        </div>
    )
}

function CheckSquare(props: any) {
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
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
    )
}
