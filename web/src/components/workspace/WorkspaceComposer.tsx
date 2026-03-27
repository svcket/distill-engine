"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import { SendHorizontal, Paperclip, Mic, X, Pause, Play, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { useLanguage } from "@/context/LanguageContext"
import { VoiceWaveform } from "./VoiceWaveform"

interface WorkspaceComposerProps {
    onIngest: (value: string) => Promise<void>
    isIngesting: boolean
}

export function WorkspaceComposer({ onIngest, isIngesting }: WorkspaceComposerProps) {
    const { t } = useLanguage()
    const [value, setValue] = useState("")
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'processing'>('idle')
    const [isDictating, setIsDictating] = useState(false)
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
        const textarea = document.getElementById("workspace-composer-textarea")
        if (textarea) (textarea as HTMLElement).style.height = "auto"
    }, [value, isIngesting, onIngest])

    const startRecording = async () => {
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            setStream(micStream)
            const mediaRecorder = new MediaRecorder(micStream)
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []
        
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data)
            }
        
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                if (isDictating) {
                    await handleWhisperTranscription(audioBlob)
                } else {
                    await handleAudioUpload(audioBlob)
                }
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
            setIsDictating(false)
        }
    }

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setDuration(prev => prev + 1)
        }, 1000)
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
            mediaRecorderRef.current.onstop = null // Don't trigger upload
            if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
            if (stream) stream.getTracks().forEach(track => track.stop())
            
            setMediaStateToIdle()
        }
    }

    const setMediaStateToIdle = () => {
        setRecordingState('idle')
        setIsDictating(false)
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

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleWhisperTranscription = async (blob: Blob) => {
        const formData = new FormData()
        formData.append('audio', blob)
        try {
            const res = await fetch('/api/whisper', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.transcript) setValue(prev => prev ? `${prev} ${data.transcript}` : data.transcript)
        } catch (err) { console.error("Whisper transcription failed:", err) }
        finally { setMediaStateToIdle() }
    }

    const handleAudioUpload = async (blob: Blob) => {
        const formData = new FormData()
        formData.append('audio', blob)
        try {
            const res = await fetch('/api/sources/record', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.url) await onIngest(data.url)
        } catch (err) { console.error("Recording upload failed:", err) }
        finally { setMediaStateToIdle() }
    }
        
    const handleVoiceInput = () => {
        if (recordingState === 'idle') {
            setIsDictating(true)
            startRecording()
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        try {
            setRecordingState('processing')
            const res = await fetch('/api/sources/upload', { method: 'POST', body: formData })
            const data = await res.json()
            if (data.url) await onIngest(data.url)
        } catch (err) { console.error("File upload failed:", err) }
        finally { setRecordingState('idle'); if (fileInputRef.current) fileInputRef.current.value = "" }
    }

    useEffect(() => {
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [])

    return (
        <div className="w-full max-w-3xl mx-auto">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                aria-label="Upload source file"
                onChange={handleFileChange}
                accept="audio/*,video/*"
            />
            
            <div className={cn(
                "relative flex flex-col rounded-[28px] border bg-background p-0 transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)] group overflow-hidden",
                value.trim() 
                    ? "border-foreground border-[1.5px] shadow-[0_4px_24px_rgba(0,0,0,0.06)]" 
                    : "border-border focus-within:border-foreground focus-within:border-[1.5px] focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            )}>
                {/* Standard Input View */}
                {recordingState === 'idle' && (
                    <>
                        <label htmlFor="workspace-composer-textarea" className="sr-only">
                            {t('composerPlaceholder')}
                        </label>
                        <textarea
                            id="workspace-composer-textarea"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement
                                target.style.height = "auto"
                                target.style.height = `${target.scrollHeight}px`
                            }}
                            placeholder={t('composerPlaceholder')}
                            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[16px] py-4 px-5 placeholder:text-muted-foreground/80 resize-none min-h-[56px] max-h-[400px] leading-relaxed text-foreground scrollbar-none"
                            rows={1}
                        />

                        <div className="flex items-center justify-between px-4 pb-2 pt-0">
                            <div className="flex items-center gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-10 h-10 rounded-full text-black/40 hover:text-black hover:bg-black/5"
                                    title="Upload audio/video"
                                >
                                    <Paperclip className="w-5 h-5" />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={handleVoiceInput}
                                    className="w-10 h-10 rounded-full text-black/40 hover:text-black hover:bg-black/5"
                                    title="Voice dictation"
                                >
                                    <Mic className="w-5 h-5" />
                                </Button>
                            </div>

                            <Button 
                                onClick={handleSend}
                                disabled={!value.trim() || isIngesting}
                                className={cn(
                                    "w-[52px] h-[44px] rounded-[18px] transition-all duration-300 flex items-center justify-center p-0",
                                    value.trim() ? "bg-black text-white" : "bg-black text-white opacity-40"
                                )}
                            >
                                {isIngesting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
                            </Button>
                        </div>
                    </>
                )}

                {/* Recording Session View */}
                {(recordingState === 'recording' || recordingState === 'paused' || recordingState === 'processing') && (
                    <div className="flex items-center px-4 py-3 h-[116px] bg-emerald-50/10 animate-in slide-in-from-bottom-2 duration-300">
                        {/* Recording Meta */}
                        <div className="flex flex-col gap-1 pr-6 min-w-[70px]">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none">
                                {recordingState === 'processing' ? 'Processing' : recordingState === 'paused' ? 'Paused' : 'Recording'}
                            </span>
                            <span className="text-xl font-mono tabular-nums text-foreground/80">
                                {formatTime(duration)}
                            </span>
                        </div>

                        {/* Waveform Visualization */}
                        <div className="flex-1 flex items-center justify-center h-full">
                            {recordingState === 'processing' ? (
                                <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                    <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                    <span className="text-sm font-medium text-emerald-600">Preparing session...</span>
                                </div>
                            ) : (
                                <VoiceWaveform stream={stream} isPaused={recordingState === 'paused'} />
                            )}
                        </div>

                        {/* Session Controls */}
                        <div className="flex items-center gap-2 pl-4">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={cancelRecording}
                                className="w-10 h-10 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                title="Cancel recording"
                                disabled={recordingState === 'processing'}
                            >
                                <X className="w-5 h-5" />
                            </Button>

                            <div className="w-px h-6 bg-border/40 mx-1" />

                            {recordingState === 'paused' ? (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={resumeRecording}
                                    className="w-10 h-10 rounded-full text-emerald-600 hover:bg-emerald-100/50"
                                    title="Resume"
                                >
                                    <Play className="w-5 h-5 fill-current" />
                                </Button>
                            ) : (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={pauseRecording}
                                    className="w-10 h-10 rounded-full text-emerald-600 hover:bg-emerald-100/50"
                                    title="Pause"
                                    disabled={recordingState === 'processing'}
                                >
                                    <Pause className="w-5 h-5 fill-current" />
                                </Button>
                            )}

                            <Button 
                                onClick={stopRecording}
                                disabled={recordingState === 'processing' || duration < 1}
                                className="h-10 px-4 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 font-bold text-xs gap-2 transition-all active:scale-95"
                            >
                                <Square className="w-3.5 h-3.5 fill-current" />
                                {isDictating ? 'Transcibe' : 'Finish'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
