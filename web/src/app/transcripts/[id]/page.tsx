"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, Play, Layout, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"

export default function TranscriptPage() {
    const params = useParams()
    const id = params?.id as string
    const router = useRouter()

    const [isRefining, setIsRefining] = useState(false)
    const [isBuildingPacket, setIsBuildingPacket] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const handleRefine = async () => {
        setIsRefining(true)
        setError(null)
        try {
            const res = await fetch("/api/transcripts/refine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            setSuccessMessage("Transcript refined into logical chunks. Ready to build Insight Packet.")
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsRefining(false)
        }
    }

    const handleBuildPacket = async () => {
        setIsBuildingPacket(true)
        setError(null)
        try {
            const res = await fetch("/api/packets/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            // Proceed to Insights Extraction View
            router.push(`/insights/${id}`)

        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsBuildingPacket(false)
        }
    }

    return (
        <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4">
                <Link href={`/sources/${id}`} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Source
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-serif font-semibold tracking-tight">Transcript Processor</h1>
                        <p className="text-muted-foreground mt-1">Clean noise, chunk ideas, and assemble the master packet.</p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-md bg-red-50 text-red-600 text-sm border border-red-200">
                    Error: {error}
                </div>
            )}

            {successMessage && (
                <div className="p-4 rounded-md bg-green-50 text-green-700 text-sm border border-green-200">
                    {successMessage}
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-brand/30 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-serif text-xl">
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">1</span>
                            Refine Transcript
                        </CardTitle>
                        <CardDescription>Strip filler words (um, ah), collapse redundant blocks, and separate into logical idea chunks.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={handleRefine} disabled={isRefining} className="w-full gap-2" variant={successMessage ? "outline" : "default"}>
                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {isRefining ? "Refining..." : (successMessage ? "Refined Successfully" : "Run Transcript Refiner")}
                        </Button>
                    </CardContent>
                </Card>

                <Card className={successMessage ? "border-brand shadow-sm" : "opacity-50 pointer-events-none"}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-serif text-xl">
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">2</span>
                            Build Packet
                        </CardTitle>
                        <CardDescription>Assemble the metadata, judgment score, and refined transcript into an exhaustive context JSON for LLMs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={handleBuildPacket} disabled={isBuildingPacket || !successMessage} className="w-full gap-2">
                            {isBuildingPacket ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layout className="w-4 h-4" />}
                            {isBuildingPacket ? "Building Packet..." : "Build Insight Packet"}
                        </Button>
                    </CardContent>
                </Card>
            </div>

        </div>
    )
}
