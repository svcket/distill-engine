"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"

export default function ReviewPage() {
    const params = useParams()
    const id = params?.id as string
    const router = useRouter()

    const [isExporting, setIsExporting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleExport = async () => {
        setIsExporting(true)
        setError(null)
        try {
            const res = await fetch("/api/assets/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            router.push("/exports")

        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="space-y-4">
                <Link href={`/drafts/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Draft Studio
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-serif font-semibold tracking-tight">Quality Assurance Review</h1>
                        <p className="text-muted-foreground mt-1">Verify factual integrity and source traceability of the draft.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">Reject Draft</Button>
                        <Button
                            className="bg-green-600 hover:bg-green-700 gap-2"
                            onClick={handleExport}
                            disabled={isExporting}
                        >
                            {isExporting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isExporting ? "Exporting..." : "Approve for Export"}
                        </Button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-md bg-red-50 text-red-600 text-sm border border-red-200">
                    Error exporting asset: {error}
                </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">

                <div className="md:col-span-2 space-y-6">
                    <Card className="border-green-200 bg-green-50/50">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2 text-green-800">
                                <CheckCircle2 className="w-5 h-5 text-green-600" /> Fact Guard Passed
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-green-700 leading-relaxed mb-4">
                                The Fact Guard agent found no hallucinations or unsupported claims. 14 out of 14 assertions trace directly back to the original transcript.
                            </p>
                            <Button size="sm" variant="outline" className="bg-white border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800">View Traceability Report</Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Review Notes & Flags</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            <div className="p-4 border border-orange-200 bg-orange-50 rounded-md">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-sm text-orange-900">Stylistic Polish Removed Nuance</h4>
                                        <p className="text-sm text-orange-700 mt-1 mb-3">
                                            The sentence <span className="italic">"Prompt-chains always break"</span> is slightly stronger than the source claim <span className="italic">"Prompt-chains are usually brittle in complex loops."</span>
                                        </p>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" className="h-7 text-xs bg-white">Accept Deviation</Button>
                                            <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-orange-700 border-orange-200">Revert to Source</Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border border-border bg-background rounded-md">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-medium text-sm">Quote Alignment</h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Quote 3 was successfully matched verbatim to <code>Chunk 4 @ 12:45</code> in the source transcript.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Asset Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Completion</div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>Drafting</span>
                                    <Badge variant="success">Done</Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-3">
                                    <span>Fact Guard</span>
                                    <Badge variant="success">Passed</Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-3">
                                    <span>Style Polish</span>
                                    <Badge variant="success">Passed</Badge>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <Button variant="outline" className="w-full gap-2 text-muted-foreground">
                                    <RefreshCw className="w-4 h-4" /> Run Review Again
                                </Button>
                            </div>

                        </CardContent>
                    </Card>
                </div>

            </div>

        </div>
    )
}
