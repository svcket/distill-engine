"use client"

import { useState, useEffect } from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { StatusIndicator } from "@/components/ui/StatusIndicator"
import { Button } from "@/components/ui/Button"
import { SourceCandidate } from "@/lib/mockData"
import { ArrowRight, FileText, UploadCloud, BrainCircuit, CheckCircle } from "lucide-react"
import Link from "next/link"

interface DraftItem {
  id: string
  title: string
  wordCount: number
  format: string
  createdAt: string
}

export default function Home() {
  const [sources, setSources] = useState<SourceCandidate[]>([])
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load real data on mount
  useEffect(() => {
    async function load() {
      try {
        const [storeRes, exportsRes] = await Promise.all([
          fetch("/api/store"),
          fetch("/api/exports/list"),
        ])

        if (storeRes.ok) {
          const data = await storeRes.json()
          setSources((data.sources || []) as SourceCandidate[])
        }

        if (exportsRes.ok) {
          const data = await exportsRes.json()
          setDrafts((data.drafts || []) as DraftItem[])
        }
      } catch { /* silently fail */ }
      finally { setIsLoaded(true) }
    }
    load()
  }, [])

  const acceptedSources = sources.filter(s => s.score >= 6)
  const processingSources = sources.filter(s => s.status === "processing")

  // Derive recent activity from persisted sources
  const recentActivity = sources
    .filter(s => s.completedStages && (s as SourceCandidate & { completedStages?: string[] }).completedStages?.length)
    .slice(0, 5)

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-500">

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Monitor sources, pipeline progress, and ready drafts.</p>
        </div>
        <Link href="/sources">
          <Button className="gap-2">
            <UploadCloud className="w-4 h-4" /> Import Source
          </Button>
        </Link>
      </div>

      {/* Stats — driven by real data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/sources">
          <Card className="hover:shadow-soft hover:border-gray-300 transition-all cursor-pointer">
            <CardHeader className="pb-4">
              <CardDescription className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4" /> Total Sources
              </CardDescription>
              <CardTitle className="text-4xl font-light">
                {isLoaded ? sources.length : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/sources">
          <Card className="hover:shadow-soft hover:border-gray-300 transition-all cursor-pointer">
            <CardHeader className="pb-4">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Accepted Sources
              </CardDescription>
              <CardTitle className="text-4xl font-light text-emerald-600">
                {isLoaded ? acceptedSources.length : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/exports">
          <Card className="hover:shadow-soft hover:border-gray-300 transition-all cursor-pointer">
            <CardHeader className="pb-4">
              <CardDescription className="flex items-center gap-2">
                <FileText className="w-4 h-4" /> Drafts Ready
              </CardDescription>
              <CardTitle className="text-4xl font-light text-brand">
                {isLoaded ? drafts.length : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-8">

        {/* Recent Sources */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Recent Sources</h2>
            <Link href="/sources" className="text-sm font-medium text-muted-foreground hover:text-brand flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {sources.length === 0 && isLoaded ? (
            <Card>
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-sm">No sources imported yet.</p>
                <Link href="/sources" className="text-sm text-brand hover:underline mt-1 inline-block">
                  Import your first source →
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {sources.slice(0, 4).map(source => (
                <Card key={source.id} className="transition-all hover:shadow-soft hover:border-gray-300">
                  <Link href={`/sources/${source.id}`} className="block p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="font-medium text-base text-balance leading-snug">{source.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {source.channel}
                          {source.score > 0 && <> · <span className={source.score >= 6 ? "text-emerald-600 font-medium" : "text-red-500"}>{source.score}/10</span></>}
                        </p>
                      </div>
                      <StatusIndicator status={source.status} className="shrink-0" />
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Ready Drafts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Ready Drafts</h2>
            <Link href="/exports" className="text-sm font-medium text-muted-foreground hover:text-brand flex items-center gap-1 transition-colors">
              Export Center <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {drafts.length === 0 && isLoaded ? (
            <Card>
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-sm">No drafts generated yet.</p>
                <p className="text-xs mt-1">Run the full pipeline on a source to generate a draft.</p>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {drafts.slice(0, 5).map(draft => (
                  <Link key={draft.id} href="/exports" className="block p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium line-clamp-1">{draft.title}</p>
                        <p className="text-xs text-muted-foreground">{draft.wordCount} words · {draft.format}</p>
                      </div>
                      <StatusIndicator status="done" />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Processing Queue — only show if there are processing items */}
        {processingSources.length > 0 && (
          <div className="space-y-4 md:col-span-2">
            <h2 className="text-lg font-medium">Currently Processing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {processingSources.map(source => (
                <Link key={source.id} href={`/sources/${source.id}`}>
                  <Card className="p-4 hover:shadow-soft transition-all">
                    <h3 className="text-sm font-medium line-clamp-1">{source.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{source.channel}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
