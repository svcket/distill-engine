"use client"

import { useState, useEffect } from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { StatusIndicator } from "@/components/ui/StatusIndicator"
import { Button } from "@/components/ui/Button"
import { SourceCandidate } from "@/lib/mockData"
import Link from "next/link"
import { useLanguage } from "@/context/LanguageContext"
import { ArrowRight, FileText, Plus, BrainCircuit, CheckCircle } from "lucide-react"

interface DraftItem {
  id: string
  title: string
  wordCount: number
  format: string
  createdAt: string
}

export default function Home() {
  const { t } = useLanguage()
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


  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-500">

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight">{t("overview")}</h1>
          <p className="text-muted-foreground mt-1">{t("monitorSources")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            className="gap-2 h-10 shadow-micro bg-black hover:bg-black/90 text-white font-serif font-medium"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) alert(`Importing ${file.name}...`);
              };
              input.click();
            }}
          >
            <Plus className="w-4 h-4" /> {t("importSource")}
          </Button>
          <Link href="/sources">
            <Button variant="outline" className="h-10 font-serif font-medium">
              {t("viewSources")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats — driven by real data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/sources">
          <Card className="hover:shadow-soft hover:border-gray-300 transition-all cursor-pointer">
            <CardHeader className="pb-4">
              <CardDescription className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4" /> {t("totalSources")}
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
                <CheckCircle className="w-4 h-4" /> {t("acceptedSources")}
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
                <FileText className="w-4 h-4" /> {t("draftsReady")}
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
            <h2 className="text-lg font-medium">{t("recentSources")}</h2>
            <Link href="/sources" className="text-sm font-medium text-muted-foreground hover:text-brand flex items-center gap-1 transition-colors">
              {t("viewAll")} <ArrowRight className="w-4 h-4" />
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
                          {source.score > 0 && <> · <span className={source.score >= 6 ? "text-emerald-600 font-medium" : "text-red-500"}>{t("qualScore")}: {source.score}/10</span></>}
                        </p>
                      </div>
                      {source.status !== 'idle' && <StatusIndicator status={source.status} className="shrink-0" />}
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
            <h2 className="text-lg font-medium">{t("readyDrafts")}</h2>
            <Link href="/exports" className="text-sm font-medium text-muted-foreground hover:text-brand flex items-center gap-1 transition-colors">
              {t("exports")} <ArrowRight className="w-4 h-4" />
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
                  <Link key={draft.id} href={`/exports?id=${draft.id}`} className="block p-4 hover:bg-muted/30 transition-colors">
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
            <h2 className="text-lg font-medium">{t("processingQueue")}</h2>
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
