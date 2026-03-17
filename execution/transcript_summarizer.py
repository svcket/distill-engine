import sys
import argparse
import json
import os
from openai import OpenAI

def generate_summary(transcript_path: str, output_path: str):
    if not os.path.exists(transcript_path):
        print(json.dumps({"status": "error", "error_detail": f"Input path not found: {transcript_path}"}), file=sys.stderr)
        sys.exit(1)
        
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            segments = json.load(f)
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": f"Failed to parse JSON: {e}"}), file=sys.stderr)
        sys.exit(1)

    # Combine text for the LLM
    try:
        if not isinstance(segments, list):
            raise ValueError(f"Expected segments to be a list, got {type(segments)}")
            
        full_text = " ".join([s.get('text', '') for s in segments if isinstance(s, dict)])
        
        if not full_text.strip():
            print(json.dumps({"status": "error", "error_detail": "Transcript text is empty after parsing segments."}), file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": f"Failed to process transcript segments: {e}"}), file=sys.stderr)
        sys.exit(1)
    
    # Cap text length to avoid token limits for very long transcripts in this initial pass
    capped_text = full_text[:40000] # Increased to ~10k tokens for gpt-4o
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "mock":
        print(json.dumps({"status": "error", "error_detail": "OPENAI_API_KEY is missing or invalid ('mock')."}), file=sys.stderr)
        sys.exit(1)
        
    client = OpenAI(api_key=api_key)
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a professional editorial assistant at Distill. Your goal is to provide a concise, readable, and faithful summary of a transcript. Focus on high-level themes, major arguments, and structural overview. Use Markdown formatting with clear sections."},
                {"role": "user", "content": f"Please summarize the following transcript:\n\n{capped_text}"}
            ],
            temperature=0.3
        )
        
        summary_text = response.choices[0].message.content
        
        output_dir = os.path.dirname(output_path)
        os.makedirs(output_dir, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(summary_text)
            
        # Also save as structured JSON for API consistency
        json_path = output_path.replace('.md', '.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump({"summary": summary_text}, f, indent=2)
            
        print(json.dumps({
            "status": "success",
            "summary_md_path": output_path,
            "summary_json_path": json_path
        }))
        
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": f"LLM Summary failed: {e}"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a conceptual summary of a refined transcript.")
    parser.add_argument("--input", required=True, help="Path to refined transcript JSON.")
    parser.add_argument("--output", required=True, help="Path to save summary markdown.")
    
    args = parser.parse_args()
    generate_summary(args.input, args.output)
