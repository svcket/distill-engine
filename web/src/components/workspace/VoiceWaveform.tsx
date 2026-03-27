"use client"
import React, { useEffect, useRef } from 'react'

interface VoiceWaveformProps {
    stream: MediaStream | null
    isPaused?: boolean
}

export function VoiceWaveform({ stream, isPaused }: VoiceWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number>(0)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)

    useEffect(() => {
        if (!stream) return

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioContextClass()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)
        
        source.connect(analyser)
        analyser.fftSize = 256 // More granular for vertical bars
        
        analyserRef.current = analyser
        audioContextRef.current = audioContext

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const draw = () => {
            if (!canvasRef.current || isPaused) {
                if (!isPaused) animationRef.current = requestAnimationFrame(draw)
                return
            }
            
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            animationRef.current = requestAnimationFrame(draw)
            analyser.getByteFrequencyData(dataArray)

            ctx.clearRect(0, 0, canvas.width, canvas.height)
            
            const barWidth = 2
            const gap = 2
            const totalBarWidth = barWidth + gap
            const midY = canvas.height / 2
            
            // Adjust loop to fill canvas width
            const numBars = Math.floor(canvas.width / totalBarWidth)
            const step = Math.floor(bufferLength / numBars)

            for (let i = 0; i < numBars; i++) {
                const dataIndex = i * step
                const value = dataArray[dataIndex]
                
                // Scale value to height (min height of 2px)
                const percent = value / 255
                const height = Math.max(percent * canvas.height * 0.9, 2)
                
                const x = i * totalBarWidth
                const y = midY - (height / 2)

                // Create brand-aligned gradient (Emerald 600 -> Emerald 200)
                const progress = i / numBars
                // Left: Emerald 600 (5, 150, 105)
                // Right: Emerald 200 (167, 243, 208)
                const r = Math.floor(5 + progress * 162)
                const g = Math.floor(150 + progress * 93)
                const b = Math.floor(105 + progress * 103)
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
                
                // Mirror effect: draw from center upwards and downwards
                ctx.beginPath()
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, barWidth, height, 1)
                } else {
                    ctx.rect(x, y, barWidth, height)
                }
                ctx.fill()
            }
        }

        draw()

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            if (audioContext.state !== 'closed') audioContext.close()
        }
    }, [stream, isPaused])

    return (
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={60} 
            className="w-full h-12"
        />
    )
}
