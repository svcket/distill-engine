import { SourceCandidate, TranscriptChunk, Status } from "./mockData"
import fs from 'fs'

/**
 * Adapters to bridge raw Python execution JSON strings into UI TypeScript models.
 * Currently, since Python scripts are scaffolding text, these adapters generate
 * predictable mocked structures based on the inputs so the UI can test interactions.
 */

// 1. Adapter for `discover_youtube_sources.py`
export function adaptScoutResponse(rawOutput: string, query: string): SourceCandidate[] {
    try {
        const data = JSON.parse(rawOutput);
        if (!Array.isArray(data)) return [];

        return data.map((item: Record<string, any>) => {
            // Parse ISO 8601 duration (e.g., PT1H2M10S or PT5M33S) roughly for UI
            let formattedDuration = item.duration;
            if (typeof formattedDuration === 'string' && formattedDuration.startsWith('PT')) {
                const hMatch = formattedDuration.match(/(\d+)H/);
                const mMatch = formattedDuration.match(/(\d+)M/);
                const sMatch = formattedDuration.match(/(\d+)S/);

                const h = hMatch ? parseInt(hMatch[1]) : 0;
                const m = mMatch ? parseInt(mMatch[1]) : 0;
                const s = sMatch ? parseInt(sMatch[1]) : 0;

                if (h > 0) formattedDuration = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                else formattedDuration = `${m}:${s.toString().padStart(2, '0')}`;
            }

            // Format ISO Date
            let published = "Unknown";
            if (item.published_at) {
                const d = new Date(item.published_at);
                published = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }

            return {
                id: item.source_id,
                title: item.title,
                channel: item.creator || item.channel,
                url: item.url,
                published: published,
                duration: formattedDuration || "Unknown",
                status: "idle",
                score: 0,
            } as SourceCandidate;
        });
    } catch (e) {
        console.warn("adaptScoutResponse failed to parse output", e);
        return [];
    }
}

// 2. Adapter for `score_source_candidates.py`
export function adaptJudgeResponse(rawOutput: string): { score: number, status: Status } {
    try {
        const payload = JSON.parse(rawOutput);
        if (payload.status === "success") {
            return {
                score: payload.score,
                status: "done"
            };
        }
    } catch (e) {
        console.warn("adaptJudgeResponse failed to parse", e);
    }
    return {
        score: 0,
        status: "failed"
    }
}

// 3. Adapter for `fetch_video_transcript.py`
export function adaptTranscriptResponse(rawOutput: string): { segments: { start: number; text: string }[], segment_count: number, status: Status } {
    try {
        const payload = JSON.parse(rawOutput);
        if ((payload.status === "success" || payload.status === "success_mocked") && payload.json_path && fs.existsSync(payload.json_path)) {
            const rawData = JSON.parse(fs.readFileSync(payload.json_path, 'utf8'));
            const segments = rawData.map((c: any) => ({
                start: c.start || 0,
                text: c.text || "",
                duration: c.duration || 0,
            }));
            return {
                segments,
                segment_count: segments.length,
                status: "done"
            };
        }
    } catch (e) {
        console.warn("adaptTranscriptResponse failed", e);
    }
    return {
        segments: [],
        segment_count: 0,
        status: "failed"
    }
}

// 4. Adapter for `refine_transcript.py`
export function adaptRefinerResponse(rawOutput: string): { segments: { text: string }[], segment_count: number, status: Status } {
    try {
        const payload = JSON.parse(rawOutput);
        // The refiner writes an output file — try to read it
        const outPath = payload.refined_json_path || payload.output_path;
        if (outPath && fs.existsSync(outPath)) {
            const rawData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
            const segments = Array.isArray(rawData) ? rawData : (rawData.segments || []);
            return {
                segments: segments.map((s: any) => ({ text: s.text || s })),
                segment_count: segments.length,
                status: "done"
            };
        }
        // Fallback: try to parse from rawOutput directly
        if (payload.status === "success" || payload.status === "success_mocked") {
            return { segments: [], segment_count: 0, status: "done" };
        }
    } catch (e) {
        console.warn("adaptRefinerResponse failed", e);
    }
    return { segments: [], segment_count: 0, status: "done" }
}

// 5. Adapter for `insight_extractor.py` (Now build_insight_packet)
export function adaptInsightResponse(rawOutput: string): { status: Status, payload?: any } {
    try {
        const payload = JSON.parse(rawOutput);
        if (payload.status === "success" || payload.status === "success_mocked") {
            return {
                status: "done",
                payload: payload.data
            };
        }
    } catch (e) {
        console.warn("adaptInsightResponse error", e);
    }
    return { status: "failed" }
}
