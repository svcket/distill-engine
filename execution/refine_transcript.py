import sys
import argparse
import json
import os
import re
import glob
from typing import List, Dict, Any

def refine_source_transcript(source_id: str) -> Dict[str, Any]:
    """
    Reads the harvested transcript and cleans it.
    Uses case-insensitive glob to find the directory, as Spotify IDs 
    can have casing mismatches between DB and Harvester.
    """
    base_dir = os.path.join(os.path.dirname(__file__), ".tmp", "transcripts")
    
    # Use glob for case-insensitive directory matching
    pattern = os.path.join(base_dir, "*")
    matching_dirs = glob.glob(pattern)
    
    target_dir = None
    for d in matching_dirs:
        if os.path.basename(d).lower() == source_id.lower():
            target_dir = d
            break
            
    if not target_dir:
        target_dir = os.path.join(base_dir, source_id)
        
    input_path = os.path.join(target_dir, f"{source_id}_raw.json")
    output_path = os.path.join(os.path.dirname(__file__), ".tmp", "refined_transcripts", source_id, f"{source_id}_refined.json")
    return refine_transcript(input_path, output_path)

def clean_text(text: str) -> str:
    """Removes standard transcript noise like [Music], [Applause], and obvious filler."""
    # Remove system tags
    text = re.sub(r'\[.*?\]', '', text)
    # Remove standalone filler words (case insensitive, bounded by spaces or punctuation)
    text = re.sub(r'\b(um|uh|ahs|umm)\b', '', text, flags=re.IGNORECASE)
    # Clean up double spaces from removals
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

def refine_transcript(transcript_path: str, output_path: str) -> Dict[str, Any]:
    if not os.path.exists(transcript_path):
        raise FileNotFoundError(f"Input path not found: {transcript_path}")
        
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            raw_chunks = json.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse JSON: {e}")

    # We bucket transcript snippets into chunks of ~120 seconds for logical reading segments
    # Or just bucket them based on text length. Let's do 120 seconds.
    BUCKET_SECONDS = 120.0
    
    refined_buckets: List[Dict] = []
    current_bucket_text = []
    current_bucket_start = 0.0
    
    if raw_chunks:
        current_bucket_start = raw_chunks[0].get('start', 0.0)

    for chunk in raw_chunks:
        text = chunk.get('text', '')
        start = chunk.get('start', 0.0)
        
        cleaned = clean_text(text)
        if not cleaned: 
            continue
            
        # If we crossed the bucket threshold, save the bucket
        if start - current_bucket_start >= BUCKET_SECONDS and current_bucket_text:
            refined_buckets.append({
                "start": current_bucket_start,
                "text": " ".join(current_bucket_text)
            })
            current_bucket_text = []
            current_bucket_start = start
            
        current_bucket_text.append(cleaned)
        
    # Flush remaining
    if current_bucket_text:
        refined_buckets.append({
            "start": current_bucket_start,
            "text": " ".join(current_bucket_text)
        })

    # Prepare markdown
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)
    
    md_path = output_path.replace('.json', '.md')
    md_lines = ["# Refined Transcript Segment Map\n"]
    
    for i, bucket in enumerate(refined_buckets):
        m, s = divmod(int(bucket['start']), 60)
        ts = f"{m:02d}:{s:02d}"
        md_lines.append(f"### Segment {i+1} [{ts}]")
        md_lines.append(bucket['text'] + "\n")
        
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(refined_buckets, f, indent=2)
            
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(md_lines))
            
        result = {
            "status": "success",
            "refined_json_path": output_path,
            "refined_md_path": md_path,
            "chunk_count": len(refined_buckets)
        }
        return result
    except Exception as e:
        raise e

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refine a raw YouTube transcript into structured chunks.")
    parser.add_argument("--input", required=True, help="Path to raw transcript file.")
    parser.add_argument("--output", required=True, help="Path to save refined transcript chunks.")
    
    args = parser.parse_args()
    try:
        res = refine_transcript(args.input, args.output)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)
