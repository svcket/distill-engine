import sys
import os

# Ensure local imports work by adding directory to path immediately
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fs_utils import get_safe_tmp_dir, get_safe_tmp_path

import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from typing import List, Optional
from openai import OpenAI

class AngleStrategy(BaseModel):
    recommended_format: str = Field(description="Primary format (e.g., 'Long-form Essay', 'X Thread')")
    secondary_formats: List[str] = Field(description="Alternative formats that fit well.")
    target_audience: str = Field(description="Who is this for?")
    framing_angle: str = Field(description="The central hook or narrative angle.")
    working_titles: List[str] = Field(description="3-5 punchy title ideas.")
    rationale: str = Field(description="Why this angle?")

def load_json(filepath: str):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception: 
            return None
    return None

def extract_angle(
    insights_path: str, 
    target_type: Optional[str] = None, 
    target_audience: Optional[str] = None, 
    target_tone: Optional[str] = None, 
    lang: str = "en"
):
    if not os.path.exists(insights_path):
        print(f"[{insights_path}] Angle Strategist: Local context missing. Attempting cloud recovery...", file=sys.stderr)
        try:
            from supabase_utils import download_artifact
            source_id = os.path.basename(insights_path).replace("_insights.json", "")
            recovered = download_artifact("insights", source_id, f"{source_id}_insights.json", insights_path)
            if not recovered:
                print(json.dumps({"status": "failed", "error": f"Insights not found locally or in cloud: {insights_path}"}), file=sys.stderr)
                sys.exit(1)
            print(f"[{source_id}] Angle Strategist: Cloud recovery SUCCESS.", file=sys.stderr)
        except Exception as e:
            print(json.dumps({"status": "failed", "error": f"Cloud recovery failed: {e}"}), file=sys.stderr)
            sys.exit(1)
        
    with open(insights_path, 'r', encoding='utf-8') as f:
        insights_bundle = json.load(f)
        
    source_id = insights_bundle.get("source_id") or insights_bundle.get("video_id")
    insights_data = insights_bundle.get("data", {})
    
    # FALLBACK: If insights are empty, try to load the summary as content source
    input_text = json.dumps(insights_data)
    if not insights_data or not any(insights_data.values()):
        print(f"[{source_id}] Angle Strategist: Insights empty. Falling back to summary context.", file=sys.stderr)
        summary_path = get_safe_tmp_path(f"{source_id}_summary.json", "summaries")
        summary_bundle = load_json(summary_path)
        if summary_bundle and summary_bundle.get("summary"):
            input_text = f"SOURCE SUMMARY (Fallback):\n{summary_bundle['summary']}"
        else:
            # Last resort: use the title
            input_text = f"SOURCE TITLE (Minimal context):\n{insights_bundle.get('title', 'Unknown Title')}"

    # LOW-SIGNAL PROTECTION: Allow analysis even if context is thin, but warn the model
    if len(input_text.strip()) < 500:
        print(f"[{source_id}] Angle Strategist: LOW-SIGNAL detected ({len(input_text)} chars). Proceeding in Meta-Analysis mode.", file=sys.stderr)
        input_text = f"[LOW-SIGNAL CONTEXT: Metadata only]\n\n{input_text}"
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "data": {
                "recommended_format": target_type or "Technical Deep Dive Essay",
                "secondary_formats": ["X Thread", "LinkedIn Post"],
                "target_audience": target_audience or "Senior engineers and Product managers",
                "framing_angle": f"Automatic Angle for {target_type or 'Essay'}: How rigid structure enables loose agency.",
                "working_titles": ["The Agency Paradox", "Building Scaffolds"],
                "rationale": f"Targeted at {target_audience or 'Builders'} with a {target_tone or 'Professional'} tone."
            }
        }
        
        out_dir = get_safe_tmp_dir("angles")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_angle.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(mock_result, f, indent=2)
            
        print(json.dumps(mock_result))
        sys.exit(0)

    client = OpenAI()
    
    intent_context = ""
    if target_type or target_audience or target_tone:
        intent_context = f"\nUSER INTENT SETTINGS:\n- Format/Type: {target_type}\n- Target Audience: {target_audience}\n- Preferred Tone: {target_tone}\n"

    system_prompt = f"""
    You are the Angle Strategist—a senior editor for a premium technical blog.
    Given these extracted insights from a source, determine the smartest editorial angle, formats, and titles.
    {intent_context}
    
    GROUNDING SHIELD (ANTI-HALLUCINATION):
    1. RESCUE MODE AWARENESS: If the input contains a '[RESCUE WARNING: Low-Signal Context]' tag, you MUST pivot to 'Safeguarded Thematic Framing'. This means avoiding deep tactical inferences and instead focusing on broad themes, historical importance, or overall platform/industry context explicitly stated in the metadata.
    2. NO PLATFORM ESSAYS: Do NOT describe the platform (YouTube, Spotify) itself. Focus on the content mentioned in the title/desc.
    3. ONE STRONG THESIS: The article must revolve around exactly ONE strong, non-generic central thesis. Filter out generic boilerplate.
    
    IMPORTANT: If USER INTENT SETTINGS provide a specific 'Format/Type', you MUST 
    output that exactly as the 'recommended_format'.
    
    Target the audience specified, or default to technical builders, engineers, and designers.
    CRITICAL: You MUST write your response entirely in the '{lang}' language.
    """
    
    # ZERO-FAILURE PROTOCOL: Metadata Ingestion
    metadata = insights_bundle
    data = insights_bundle.get("data", {})
    
    source_title = metadata.get("title") or data.get("source_context") or metadata.get("source_id") or "Unknown Title"
    source_creator = metadata.get("creator") or metadata.get("channel") or data.get("speaker_identity") or "Unknown Creator"
    source_url = metadata.get("url") or "#"

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Strategize an angle for these insights:\n\n{input_text}"}
            ],
            response_format=AngleStrategy,
        )
        
        extracted_data = completion.choices[0].message.parsed
        angle_data = json.loads(extracted_data.model_dump_json())
        status = "success"
        
    except Exception as e:
        print(f"[{source_id}] Angle Strategist: High-fidelity parse failed ({str(e)}). PIVOTING to Meta-Analysis Fallback.", file=sys.stderr)
        
        # ZERO-FAILURE FALLBACK: Generate a logical strategy based on title/creator only
        angle_data = {
            "recommended_format": target_type or "Strategic Overview",
            "secondary_formats": ["X Thread", "LinkedIn Newsletter"],
            "target_audience": target_audience or "The Distill Community",
            "framing_angle": f"The '{source_title}' Perspective: A Meta-Analysis of {source_creator}'s latest contribution.",
            "working_titles": [
                f"Analyzing {source_title}",
                f"The {source_creator} Thesis",
                f"Context Report: {source_title}"
            ],
            "rationale": f"Generated as a high-fidelity Meta-Strategy due to restricted source content. Anchored to creator identity: {source_creator}."
        }
        status = "success_fallback"
        
    # Final Result Persistence
    bundle = {
        "status": status,
        "source_id": source_id,
        "data": angle_data
    }
    
    out_dir = get_safe_tmp_dir("angles")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{source_id}_angle.json")
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, indent=2)
        
    print(json.dumps(bundle))
    sys.exit(0)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Strategize an editorial angle from generated insights.")
    parser.add_argument("--input", required=True, help="Path to input insights JSON.")
    parser.add_argument("--type", help="Target content type/format.")
    parser.add_argument("--audience", help="Target audience.")
    parser.add_argument("--tone", help="Target tone.")
    
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    extract_angle(args.input, args.type, args.audience, args.tone, args.lang)
