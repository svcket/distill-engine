"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import { Search, Paperclip, Mic, Loader2, X, Pause, Play, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { useLanguage } from "@/context/LanguageContext"
import { VoiceWaveform } from "./VoiceWaveform"

interface UnifiedSourceInputProps {
    onIngest: (value: string) => Promise<void>
    onFileSelect: (file: File) => void
    isIngesting: boolean
}

export function UnifiedSourceInput({ onIngest, onFileSelect, isIngesting }: UnifiedSourceInputProps) {
    const { t } = useLanguage()
    const [value, setValue] = useState("")
    const [isDragging, setIsDragging] = useState(false)
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'processing'>('idle')
    const [duration, setDuration] = useState(0)
    const [stream, setStream] = useState<MediaStream | null>(null)
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    const handleSend = useCallback(() => {
        if (!value.trim() || isIngesting) return
        onIngest(value)
        setValue("")
    }, [value, isIngesting, onIngest])

    const startRecording = async () => {
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                } 
            })
            setStream(micStream)
            
            // Try to use a high-quality mimeType if supported
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                ? 'audio/webm;codecs=opus' 
                : 'audio/webm';
                
            const mediaRecorder = new MediaRecorder(micStream, { mimeType })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []
        
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data)
            }
        
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                await handleAudioUpload(audioBlob)
                micStream.getTracks().forEach(track => track.stop())
                setStream(null)
            }
        
            mediaRecorder.start()
            setRecordingState('recording')
            setDuration(0)
            startTimer()
        } catch (err) {
            console.error("Microphone access denied:", err)
            setRecordingState('idle')
        }
    }

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000)
    }

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
    }

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause()
            setRecordingState('paused')
            stopTimer()
        }
    }

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume()
            setRecordingState('recording')
            startTimer()
        }
    }

    const cancelRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = null
            if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
            if (stream) stream.getTracks().forEach(track => track.stop())
            resetToIdle()
        }
    }

    const resetToIdle = () => {
        setRecordingState('idle')
        setDuration(0)
        setStream(null)
        stopTimer()
    }
        
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
            setRecordingState('processing')
            stopTimer()
        }
    }

    const handleAudioUpload = async (blob: Blob) => {
        const formData = new FormData()
        formData.append('audio', blob)
        try {
            const res = await fetch('/api/sources/record', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.url) await onIngest(data.url)
        } catch (err) {
            console.error("Recording upload failed:", err)
        } finally {
            resetToIdle()
        }
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [])

    if (recordingState !== 'idle') {
        return (
            <div className="flex items-center gap-4 w-full h-14 bg-emerald-50/20 border border-emerald-100 rounded-xl px-4 animate-in slide-in-from-top-2 duration-300 shadow-sm">
                <div className="flex flex-col min-w-[60px]">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                        {recordingState === 'processing' ? 'Processing' : recordingState === 'paused' ? 'Paused' : 'Recording'}
                    </span>
                    <span className="text-lg font-mono tabular-nums text-foreground/80 leading-tight">
                        {formatTime(duration)}
                    </span>
                </div>

                <div className="flex-1 flex items-center justify-center h-full relative overflow-hidden">
                    {recordingState === 'processing' ? (
                        <div className="flex items-center gap-3 animate-in fade-in duration-300">
                             <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                             <span className="text-sm font-medium text-emerald-600">Preparing recording...</span>
                        </div>
                    ) : (
                        <VoiceWaveform stream={stream} isPaused={recordingState === 'paused'} />
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={cancelRecording}
                        className="w-10 h-10 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        disabled={recordingState === 'processing'}
                    >
                        <X className="w-5 h-5" />
                    </Button>

                    <div className="w-px h-6 bg-emerald-100 mx-1" />

                    {recordingState === 'paused' ? (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={resumeRecording}
                            className="w-10 h-10 rounded-full text-emerald-600 hover:bg-emerald-100/50"
                        >
                            <Play className="w-5 h-5 fill-current" />
                        </Button>
                    ) : (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={pauseRecording}
                            className="w-10 h-10 rounded-full text-emerald-600 hover:bg-emerald-100/50"
                            disabled={recordingState === 'processing'}
                        >
                            <Pause className="w-5 h-5 fill-current" />
                        </Button>
                    )}

                    <Button 
                        onClick={stopRecording}
                        disabled={recordingState === 'processing' || duration < 1}
                        className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm font-bold text-[11px] gap-2 transition-all active:scale-95"
                    >
                        <Square className="w-3 h-3 fill-current" />
                        Finish
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div 
            className={cn(
                "flex flex-col md:flex-row gap-3 w-full animate-in fade-in slide-in-from-top-4 duration-500",
                isDragging && "scale-[1.01] transition-transform duration-200"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) onFileSelect(file) }}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="video/*,audio/*"
                title="Upload audio/video"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) onFileSelect(file) }}
            />
            
            <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-brand" />
                <input
                    type="text"
                    placeholder={isDragging ? "Drop your file here..." : (t("composerPlaceholder") || "Paste source URL or search...")}
                    aria-label={t("composerPlaceholder") || "Paste source URL or search..."}
                    className={cn(
                        "w-full pl-11 pr-24 h-12 rounded-xl border border-border bg-background shadow-micro transition-all outline-none",
                        "focus:ring-4 focus:ring-brand/5 focus:border-brand/30 dark:border-white/5 dark:focus:border-white/15 dark:focus:ring-white/5",
                        isDragging && "border-brand bg-brand/5 ring-4 ring-brand/5"
                    )}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                    disabled={isIngesting || isDragging}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button 
                        size="sm" 
                        className={cn(
                            "h-8 px-4 text-xs font-serif font-medium transition-all duration-300 border relative overflow-hidden",
                            value.trim() 
                                ? "bg-black text-white dark:bg-white dark:text-black hover:scale-[1.02] active:scale-[0.98] hover:shadow-soft" 
                                : "bg-muted text-muted-foreground opacity-40 grayscale pointer-events-none"
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
                    title="Upload audio/video"
                    type="button"
                >
                    <Paperclip className="w-5 h-5 text-foreground/70" />
                </Button>

                <Button 
                    variant="outline"
                    className="w-12 h-12 p-0 rounded-lg shadow-micro border-border transition-all active:scale-95 hover:bg-muted/50"
                    onClick={startRecording}
                    title="Record audio"
                    disabled={isIngesting}
                    type="button"
                >
                    <Mic className="w-5 h-5 text-foreground/70" />
                </Button>
            </div>
        </div>
    )
}
