import sys
import argparse
import json
import os
import glob

def find_metadata(video_id: str) -> dict:
    source_dir = os.path.join(os.path.dirname(__file__), ".tmp", "sources")
    if not os.path.exists(source_dir): return {}
    for file in glob.glob(os.path.join(source_dir, "*.json")):
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        if item.get("video_id") == video_id: return item
        except: continue
    return {}

def load_json(filepath: str):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return None

def build_packet(video_id: str):
    metadata = find_metadata(video_id)
    
    judge_path = os.path.join(os.path.dirname(__file__), ".tmp", "judgments", f"{video_id}_judgment.json")
    judgment = load_json(judge_path) or {}
    
    refined_path = os.path.join(os.path.dirname(__file__), ".tmp", "refined_transcripts", video_id, f"{video_id}_refined.json")
    transcript = load_json(refined_path) or []
    
    # deterministic structured packaging without invoking LLMs yet
    packet = {
        "video_id": video_id,
        "metadata": metadata,
        "judgment": judgment,
        "transcript_segments": transcript,
        "packet_status": "ready_for_extraction",
        "word_count_estimate": sum(len(chunk.get("text", "").split()) for chunk in transcript)
    }
    
    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "insight_packets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{video_id}_packet.json")
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(packet, f, indent=2)
        
    print(json.dumps({
        "status": "success",
        "video_id": video_id,
        "packet_path": out_path,
        "segment_count": len(transcript)
    }))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package ingestion data into a unified insight packet.")
    parser.add_argument("--video-id", required=True, help="YouTube video ID.")
    
    args = parser.parse_args()
    build_packet(args.video_id)
