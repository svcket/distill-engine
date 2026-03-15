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
    full_text = " ".join([s.get('text', '') for s in segments])
    
    # Cap text length to avoid token limits for very long transcripts in this initial pass
    # (In a production system, we'd chunk and recursive summarize)
    capped_text = full_text[:20000] # roughly 4k-5k tokens
    
    client = OpenAI()
    
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
