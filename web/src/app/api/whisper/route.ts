import { NextResponse } from 'next/server'

/**
 * Handle real-time voice dictation (Whisper flow simulation/integration).
 * In a real production environment, this would call OpenAI Whisper API or an internal service.
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const audioFile = formData.get('audio') as Blob
        
        if (!audioFile) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
        }

        // Simulating Whisper transcription delay & result
        // We'll return some mock text based on the "recording"
        await new Promise(resolve => setTimeout(resolve, 800)) // Artificial latency
        
        const mockTranscriptions = [
            "What is the current status of the project?",
            "Can you give me a summary of the latest YouTube source?",
            "Check the DQM score for the recent RSS feeds.",
            "Draft a new report based on the podcast source.",
            "Analyze the operational intelligence metrics for today."
        ]
        
        const transcript = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)]

        return NextResponse.json({ 
            success: true, 
            transcript: transcript
        })

    } catch (err: unknown) {
        console.error("Whisper transcription failed:", err)
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
