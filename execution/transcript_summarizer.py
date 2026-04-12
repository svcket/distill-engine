from fs_utils import get_safe_tmp_dir, get_safe_tmp_path

import sys
import argparse
import json
import os
import re
from openai import OpenAI
from typing import Dict, Any
from supabase_utils import upload_artifact

def summarize_transcript(source_id: str, lang: str = "en") -> Dict[str, Any]:
    """Convenience wrapper for the Unified Analysis Cluster."""
    base = os.path.dirname(__file__)
    transcript_path = get_safe_tmp_path(f"{source_id}_refined.json", f"refined_transcripts/{source_id}")
    
    # Fallback to raw if refined doesn't exist yet (though it should in the standard pipeline)
    if not os.path.exists(transcript_path):
        transcript_path = get_safe_tmp_path(f"{source_id}_raw.json", f"transcripts/{source_id}")
    
    output_path = os.path.join(base, ".tmp", "summaries", f"{source_id}_summary.md")
    return generate_summary(transcript_path, output_path, lang)

def generate_summary(transcript_path: str, output_path: str, lang: str = "en") -> Dict[str, Any]:
    # --- TOPOLOGICAL RESOLUTION ---
    # If the provided path doesn't exist, we try to auto-resolve from raw transcripts
    if not os.path.exists(transcript_path):
        # Extract source_id from the parent directory name 
        source_id = os.path.basename(os.path.dirname(transcript_path))
        # Base is execution/ (the parent of .tmp)
        # Assuming path like .../execution/.tmp/refined_transcripts/id/id_refined.json
        # We need the path to .../execution/
        parts = transcript_path.split(os.sep)
        try:
            tmp_idx = parts.index(".tmp")
            base = os.sep.join(parts[:tmp_idx])
        except ValueError:
            # Fallback to current script dir if .tmp not in path
            base = os.path.dirname(os.path.abspath(__file__))
            
        fallback = get_safe_tmp_path(f"{source_id}_raw.json", f"transcripts/{source_id}")
        if os.path.exists(fallback):
            transcript_path = fallback
        else:
            raise FileNotFoundError(f"Input path not found: {transcript_path}")
        
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            segments = json.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse JSON: {e}")

    # Combine text for the LLM
    try:
        if not isinstance(segments, list):
            raise ValueError(f"Expected segments to be a list, got {type(segments)}")
            
        full_text = " ".join([s.get('text', '') for s in segments if isinstance(s, dict)])
        
        if not full_text.strip():
            raise ValueError("Transcript text is empty after parsing segments.")
            
    except Exception as e:
        raise e
    
    # Cap text length to avoid token limits for very long transcripts in this initial pass
    capped_text = full_text[:40000] # Increased to ~10k tokens for gpt-4o
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "mock":
        raise ValueError("OPENAI_API_KEY is missing or invalid ('mock').")
        
    client = OpenAI(api_key=api_key)
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": f"You are a professional editorial strategist at Distill. Your goal is to "
                                             f"provide a high-fidelity intelligence report from a raw transcript or "
                                             f"official source context. If audio was restricted, use the available "
                                             f"metadata to synthesize the core strategic intent.\n"
                                             f"Focus on high-level themes, major arguments, and analytical overview. "
                                             f"Frame the output as an 'Official Source Intelligence' report.\n"
                                             f"CRITICAL: You MUST write your response entirely in the '{lang}' language."},
                {"role": "user", "content": f"Please provide an intelligence summary for the following source context:\n\n{capped_text}"}
            ],
            temperature=0.3
        )
        
        summary_text = response.choices[0].message.content
        
        output_dir = os.path.dirname(output_path)
        os.makedirs(output_dir, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(summary_text)
            
        # Also save as structured JSON for API consistency
        json_path = output_path.replace(".md", ".json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump({"summary": summary_text}, f, indent=2)

        # --- CLOUD BRIDGE ---
        # Upload the JSON result to Supabase Storage
        source_id = os.path.basename(json_path).replace('_summary.json', '')
        upload_artifact("summaries", source_id, json_path)
            
        result = {
            "status": "success",
            "summary_md_path": output_path,
            "summary_json_path": json_path,
            "summary": summary_text
        }
        return result
        
    except Exception as e:
        raise e

def infer_source_name(text: str, hint: str = None, lang: str = "en") -> str:
    """
    Cognitive Identity Recovery: use summary/description (and an optional messy hint) 
    to infer a high-fidelity original title.
    """
    if not text or len(text) < 10:
        return None

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "mock":
        return None
        
    client = OpenAI(api_key=api_key)
    
    # Construct a more context-aware prompt
    hint_context = f"\nScraped Title Hint: '{hint}'" if hint else ""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": f"You are a professional editorial curator at Distill. Your goal is to "
                                             f"infer the EXACT original title of a podcast episode or article. Use "
                                             f"the provided content summary/description and any title hint to "
                                             f"accurately align with the creator's original naming. Filter out "
                                             f"generic suffixes like '| Podcast on Spotify' or 'Episode 123'. "
                                             f"Output ONLY the clean title text (max 70 chars). Language: {lang}"},
                {"role": "user", "content": f"Source Content:\n{text[:4000]}{hint_context}"}
            ],
            temperature=0.3
        )
        
        inferred_title = response.choices[0].message.content.strip()
        # Clean up any potential markdown or quotes the LLM might have added
        inferred_title = re.sub(r'^["\']|["\']$', '', inferred_title)
        
        return inferred_title
        
    except Exception as e:
        print(f"[IdentityRecovery] LLM title inference failed: {e}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a conceptual summary of a refined transcript.")
    parser.add_argument("--input", required=True, help="Path to refined transcript JSON.")
    parser.add_argument("--output", required=True, help="Path to save summary markdown.")
    
    
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    try:
        res = generate_summary(args.input, args.output, lang=args.lang)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)
