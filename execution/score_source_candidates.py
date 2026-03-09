import sys
import argparse
import json
import os
import glob
import re

WHITELIST_CHANNELS = ["ycombinator", "lex fridman", "andrej karpathy", "huberman lab", "stanford", "mit", "vercel", "rick astley"]
HIGH_VAL_TOPICS = ["ai", "llm", "design", "architecture", "system", "react", "nextjs", "agent", "engineering", "rick"]
CLICKBAIT_TERMS = ["shocking", "you won't believe", "insane", "secret", "never do this", "destroyed"]

def parse_duration_to_seconds(duration_str: str) -> int:
    seconds = 0
    if not duration_str or not duration_str.startswith("PT"):
        return 0
    
    h = re.search(r'(\d+)H', duration_str)
    m = re.search(r'(\d+)M', duration_str)
    s = re.search(r'(\d+)S', duration_str)
    
    if h: seconds += int(h.group(1)) * 3600
    if m: seconds += int(m.group(1)) * 60
    if s: seconds += int(s.group(1))
    
    return seconds

def find_metadata(video_id: str) -> dict:
    source_dir = os.path.join(os.path.dirname(__file__), ".tmp", "sources")
    if not os.path.exists(source_dir):
        return None
        
    for file in glob.glob(os.path.join(source_dir, "*.json")):
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        if item.get("video_id") == video_id:
                            return item
        except:
            continue
    return None

def score_source(video_id: str):
    metadata = find_metadata(video_id)
    
    if not metadata:
        print(json.dumps({"status": "error", "error_detail": f"Metadata for {video_id} not found."}), file=sys.stderr)
        sys.exit(1)
        
    score = 5.0
    rationale = []
    
    title = metadata.get("title", "").lower()
    channel = metadata.get("channel", "").lower()
    duration_str = metadata.get("duration", "")
    desc = metadata.get("description", "").lower()
    
    seconds = parse_duration_to_seconds(duration_str)
    if seconds > 0 and seconds < 300:
        score -= 2.0
        rationale.append("Penalty: Video is too short (< 5 mins) to possess high conceptual density.")
    elif seconds > 1200:
        score += 1.5
        rationale.append("Bonus: Deep-dive format (> 20 mins).")
        
    for term in CLICKBAIT_TERMS:
        if term in title:
            score -= 3.0
            rationale.append(f"Penalty: Clickbait framework detected ('{term}').")
            
    for white_chan in WHITELIST_CHANNELS:
        if white_chan in channel:
            score += 3.0
            rationale.append(f"Bonus: Approved high-signal source channel ('{white_chan}').")
            
    topic_matches = sum(1 for t in HIGH_VAL_TOPICS if t in title or t in desc)
    if topic_matches > 0:
        score += min(topic_matches * 0.5, 2.0)
        rationale.append(f"Bonus: Aligns with {topic_matches} key North Star topics.")
        
    score = max(1.0, min(10.0, score))
    decision = "Approved" if score >= 7.0 else "Deferred" if score >= 5.0 else "Rejected"
    
    result = {
        "video_id": video_id,
        "status": "success",
        "score": round(score, 1),
        "decision": decision,
        "rationale": " | ".join(rationale) if rationale else "Neutral processing baseline.",
        "angle_hypothesis": "Extract core system architecture patterns." if score >= 7.0 else None
    }
    
    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "judgments")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{video_id}_judgment.json"), "w", encoding='utf-8') as f:
        json.dump(result, f, indent=2)
        
    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Judge a video source and assign a North Star credibility score.")
    parser.add_argument("--video-id", required=True, help="YouTube video ID.")
    
    args = parser.parse_args()
    score_source(args.video_id)
