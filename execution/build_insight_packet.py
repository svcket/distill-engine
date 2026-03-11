"""
Insight Packet Builder — packages source metadata, judgment, and transcript
into a unified payload for LLM extraction stages.

Key change: limits transcript segments to the most information-dense
5–8 chunks to reduce LLM token usage and latency.
"""

import sys
import argparse
import json
import os
import glob


def load_json(path: str):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def find_source(source_id: str) -> dict:
    base = os.path.dirname(__file__)
    source_dir = os.path.join(base, ".tmp", "sources")

    # Direct file first
    direct = os.path.join(source_dir, f"{source_id}.json")
    if os.path.exists(direct):
        data = load_json(direct)
        if isinstance(data, list) and data:
            return data[0]
        return data or {}

    # Scan all files
    for file in glob.glob(os.path.join(source_dir, "*.json")):
        try:
            data = load_json(file)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("video_id") == source_id or item.get("source_id") == source_id:
                    return item
        except Exception:
            continue
    return {"source_id": source_id}


def rank_segments(segments: list, max_segments: int = 7) -> list:
    """
    Select the most information-dense segments.
    Ranks by word count (longer = denser) and avoids repetitive short segments.
    Returns at most max_segments chunks spread across the source timeline.
    """
    if not segments or len(segments) <= max_segments:
        return segments

    # Score each segment by word density
    scored = []
    for i, seg in enumerate(segments):
        text = seg.get("text", "")
        word_count = len(text.split())
        # Penalise very short segments (< 10 words)
        density = word_count if word_count >= 10 else word_count * 0.3
        scored.append((density, i, seg))

    # Also ensure temporal spread — take chunks from beginning, middle, end
    n = len(segments)
    thirds = [segments[:n//3], segments[n//3:2*n//3], segments[2*n//3:]]

    selected = []
    per_third = max(1, max_segments // 3)
    remaining = max_segments

    for third in thirds:
        if not third:
            continue
        # Pick top-density from this third
        candidates = sorted(third, key=lambda s: len(s.get("text","").split()), reverse=True)
        selected.extend(candidates[:per_third])
        remaining -= per_third

    # Fill any remaining slots with globally top-density segments not already selected
    selected_texts = {s.get("text", "") for s in selected}
    for _, _, seg in sorted(scored, reverse=True):
        if len(selected) >= max_segments:
            break
        if seg.get("text", "") not in selected_texts:
            selected.append(seg)
            selected_texts.add(seg.get("text", ""))

    # Return in original timeline order
    selected_indices = {s.get("start", 0): s for s in selected}
    return sorted(selected, key=lambda s: s.get("start", 0))


def build_packet(source_id: str):
    base = os.path.dirname(__file__)
    metadata = find_source(source_id)

    judgment = load_json(os.path.join(base, ".tmp", "judgments", f"{source_id}_judgment.json")) or {}

    # Load refined transcript (prefer refined; fall back to raw)
    refined_path = os.path.join(base, ".tmp", "refined_transcripts", source_id, f"{source_id}_refined.json")
    raw_path = os.path.join(base, ".tmp", "transcripts", source_id, f"{source_id}_raw.json")

    transcript = load_json(refined_path) or load_json(raw_path) or []

    # Select top segments — max 7 to control LLM token usage
    selected_segments = rank_segments(transcript, max_segments=7)
    total_words = sum(len(s.get("text", "").split()) for s in selected_segments)

    packet = {
        "source_id": source_id,

        "source_type": metadata.get("source_type", "youtube"),
        "metadata": metadata,
        "judgment": judgment,
        "transcript_segments": selected_segments,
        "total_segments_available": len(transcript),
        "segments_selected": len(selected_segments),
        "word_count_estimate": total_words,
        "packet_status": "ready_for_extraction",
    }

    out_dir = os.path.join(base, ".tmp", "insight_packets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{source_id}_packet.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(packet, f, indent=2)

    print(json.dumps({
        "status": "success",
        "source_id": source_id,

        "packet_path": out_path,
        "segment_count": len(selected_segments),
        "total_segments": len(transcript),
        "word_count": total_words,
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build insight packet for any source type.")
    parser.add_argument("--source-id", "--video-id", dest="source_id", required=True,
                        help="Source ID (or legacy YouTube video ID).")
    args = parser.parse_args()
    build_packet(args.source_id)
