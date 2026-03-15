"use client"

import { useState, useRef, useCallback } from "react"
import { Search, Paperclip, Mic, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { useLanguage } from "@/context/LanguageContext"

interface UnifiedSourceInputProps {
    onIngest: (value: string) => Promise<void>
    onFileSelect: (file: File) => void
    isIngesting: boolean
}

export function UnifiedSourceInput({ onIngest, onFileSelect, isIngesting }: UnifiedSourceInputProps) {
    const { t } = useLanguage()
    const [value, setValue] = useState("")
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing'>('idle')
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = useCallback(() => {
        if (!value.trim() || isIngesting) return
        onIngest(value)
        setValue("")
    }, [value, isIngesting, onIngest])

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []
        
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data)
            }
        
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                await handleAudioUpload(audioBlob)
                stream.getTracks().forEach(track => track.stop())
            }
        
            mediaRecorder.start()
            setRecordingState('recording')
        } catch (err) {
            console.error("Microphone access denied:", err)
            setRecordingState('idle')
        }
    }
        
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
            setRecordingState('processing')
        }
    }
        
    const handleAudioUpload = async (blob: Blob) => {
        const formData = new FormData()
        formData.append('audio', blob)
        
        try {
            const res = await fetch('/api/sources/record', {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (data.url) {
                await onIngest(data.url)
            }
        } catch (err) {
            console.error("Recording upload failed:", err)
        } finally {
            setRecordingState('idle')
        }
    }

    return (
        <div className="flex flex-col md:flex-row gap-3 w-full animate-in fade-in slide-in-from-top-4 duration-500">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="video/*,audio/*,.pdf,.txt,.docx"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onFileSelect(file)
                }}
            />
            
            <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-brand" />
                <input
                    type="text"
                    placeholder={t("composerPlaceholder") || "Paste source URL or search..."}
                    aria-label={t("composerPlaceholder") || "Paste source URL or search..."}
                    className={cn(
                        "w-full pl-11 pr-24 h-12 rounded-xl border border-border bg-background shadow-micro transition-all outline-none",
                        "focus:ring-4 focus:ring-brand/5 focus:border-brand/30 dark:border-white/5 dark:focus:border-white/15 dark:focus:ring-white/5"
                    )}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend()
                    }}
                    disabled={isIngesting}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button 
                        size="sm" 
                        className={cn(
                            "h-8 px-4 text-xs font-serif font-medium transition-all duration-300 border relative overflow-hidden",
                            value.trim() 
                                ? "bg-black text-white dark:bg-white dark:text-black hover:scale-[1.02] active:scale-[0.98] hover:shadow-soft opacity-100 border-black/10 dark:border-white/10" 
                                : "bg-muted text-muted-foreground opacity-40 grayscale pointer-events-none border-border/50"
                        )}
                        onClick={handleSend}
                        disabled={isIngesting || !value.trim()}
                    >
                        {isIngesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ingest"}
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button 
                    variant="outline"
                    className="w-12 h-12 p-0 rounded-lg shadow-micro border-border hover:bg-muted/50 transition-all active:scale-95"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    type="button"
                >
                    <Paperclip className="w-5 h-5 text-foreground/70" />
                </Button>

                <Button 
                    variant="outline"
                    className={cn(
                        "w-12 h-12 p-0 rounded-lg shadow-micro border-border transition-all active:scale-95 relative overflow-hidden",
                        recordingState === 'recording' ? "bg-red-50 border-red-200 text-red-500 animate-pulse" : "hover:bg-muted/50"
                    )}
                    onClick={() => recordingState === 'recording' ? stopRecording() : startRecording()}
                    title={recordingState === 'recording' ? "Stop recording" : "Record audio"}
                    disabled={recordingState === 'processing' || isIngesting}
                    type="button"
                >
                    {recordingState === 'processing' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-brand" />
                    ) : (
                        <Mic className={cn("w-5 h-5", recordingState === 'recording' ? "fill-current" : "text-foreground/70")} />
                    )}
                </Button>
            </div>
        </div>
    )
}
