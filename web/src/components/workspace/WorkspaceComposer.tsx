"use client"

import { useState, useRef, useCallback } from "react"
import { SendHorizontal, Paperclip, Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { useLanguage } from "@/context/LanguageContext"

interface WorkspaceComposerProps {
    onIngest: (value: string) => Promise<void>
    isIngesting: boolean
}

export function WorkspaceComposer({ onIngest, isIngesting }: WorkspaceComposerProps) {
    const { t } = useLanguage()
    const [value, setValue] = useState("")
    const [isListening, setIsListening] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = useCallback(() => {
        if (!value.trim() || isIngesting) return
        onIngest(value)
        setValue("")
        
        // Reset textarea height
        const textarea = document.getElementById("workspace-composer-textarea")
        if (textarea) (textarea as HTMLElement).style.height = "auto"
    }, [value, isIngesting, onIngest])

    const handleVoiceInput = () => {
        // Implementation shell for voice recording
        setIsListening(!isListening)
        console.log("Mic clicked - recording flow would trigger here")
    }

    const handleFileClick = () => {
        fileInputRef.current?.click()
    }

    return (
        <div className="w-full max-w-3xl mx-auto">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => console.log("File selected:", e.target.files?.[0])}
            />
            
            <div className={cn(
                "relative flex flex-col rounded-[28px] border bg-white p-2 transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)] group",
                value.trim() 
                    ? "border-black border-[1.5px] shadow-[0_4px_24px_rgba(0,0,0,0.06)]" 
                    : "border-[#E5E5E5] focus-within:border-black focus-within:border-[1.5px] focus-within:shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
            )}>
                {/* Textarea with auto-expand */}
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
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-[16px] py-4 px-3 placeholder:text-neutral-400/80 resize-none min-h-[48px] max-h-[400px] leading-relaxed text-neutral-900 scrollbar-none"
                    rows={1}
                />

                {/* Integrated Action Bar */}
                <div className="flex items-center justify-between px-4 pb-2 pt-1 transition-opacity duration-300">
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleFileClick}
                            className="w-10 h-10 rounded-full text-black/40 hover:text-black hover:bg-black/5 transition-all focus-visible:ring-0 focus:ring-0"
                            title="Upload file"
                        >
                            <Paperclip className="w-5 h-5" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleVoiceInput}
                            className={cn(
                                "w-10 h-10 rounded-full transition-all focus-visible:ring-0 focus:ring-0",
                                isListening ? "text-black animate-pulse bg-black/5" : "text-black/40 hover:text-black hover:bg-black/5"
                            )}
                            title="Record audio"
                        >
                            <Mic className="w-5 h-5" />
                        </Button>
                    </div>

                    <Button 
                        onClick={handleSend}
                        disabled={!value.trim() || isIngesting}
                        className={cn(
                            "w-[52px] h-[48px] rounded-[18px] transition-all duration-300 flex items-center justify-center p-0 focus-visible:ring-0 focus:ring-0",
                            value.trim() 
                                ? "bg-[#FF4D00] text-white shadow-lg shadow-[#FF4D00]/20 hover:bg-[#E64500] hover:scale-105" 
                                : "bg-[#FFB499] text-white opacity-100 cursor-not-allowed"
                        )}
                    >
                        {isIngesting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <SendHorizontal className="w-5 h-5" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
