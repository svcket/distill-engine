"use client"

import React, { useState } from 'react'
import { Plus, Search, Filter, LayoutGrid, List, ChevronRight, Settings, Info, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLanguage } from '@/context/LanguageContext'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UnifiedSourceInput } from './UnifiedSourceInput'
import { useWorkspace } from '@/context/WorkspaceContext'
import { toast } from 'sonner'

export function WorkspaceHeader() {
  const { t } = useLanguage()
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const { workspaceId, refreshSources } = useWorkspace()
  const [isIngesting, setIsIngesting] = useState(false)

  const handleIngest = async (url: string) => {
    if (!url) return
    setIsIngesting(true)
    try {
      const res = await fetch('/api/pipeline/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, workspaceId })
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Source ingestion started")
        refreshSources()
        setIsPanelOpen(false)
      } else {
        toast.error(data.error || "Failed to start ingestion")
      }
    } catch (err) {
      toast.error("An error occurred")
    } finally {
      setIsIngesting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button 
          onClick={() => setIsPanelOpen(true)}
          className="bg-white text-black hover:bg-white/90 font-serif font-medium h-9 gap-2 px-4 shadow-soft"
        >
          <Plus className="w-4 h-4" />
          {t("fetchTranscript") || "Fetch Transcript"}
        </Button>
      </div>

      {isPanelOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-300" 
          onClick={() => setIsPanelOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 right-0 w-[400px] bg-background border-l border-border z-50 transform transition-transform duration-300 ease-in-out shadow-2xl",
        isPanelOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium font-serif">Fetch Transcript</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsPanelOpen(false)} className="rounded-full hover:bg-white/5">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Connect Source</h3>
            <p className="text-[12px] text-white/40 leading-relaxed">
              Paste a Spotify, YouTube or Apple Podcast link to automatically fetch and refine the transcript.
            </p>
            <UnifiedSourceInput 
              onIngest={handleIngest}
              onFileSelect={() => {}}
              isIngesting={isIngesting}
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
             <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Instructions</h3>
             <div className="space-y-4">
               <div className="flex gap-3">
                 <div className="shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/60">1</div>
                 <p className="text-[12px] text-white/40 leading-relaxed pt-0.5">Paste the URL of the episode you want to process.</p>
               </div>
               <div className="flex gap-3">
                 <div className="shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/60">2</div>
                 <p className="text-[12px] text-white/40 leading-relaxed pt-0.5">Wait for the harvester to bypass DRM and fetch the audio.</p>
               </div>
               <div className="flex gap-3">
                 <div className="shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/60">3</div>
                 <p className="text-[12px] text-white/40 leading-relaxed pt-0.5">The transcript will be refined and ready for the Draft Studio.</p>
               </div>
             </div>
          </div>
        </div>
      </aside>
    </>
  )
}
