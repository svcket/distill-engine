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
        print(json.dumps({"status": "failed", "error": f"Insights not found: {insights_path}"}), file=sys.stderr)
        sys.exit(1)
        
    with open(insights_path, 'r', encoding='utf-8') as f:
        insights_bundle = json.load(f)
        
    source_id = insights_bundle.get("source_id") or insights_bundle.get("video_id")
    insights_data = insights_bundle.get("data", {})
    
    # FALLBACK: If insights are empty, try to load the summary as content source
    input_text = json.dumps(insights_data)
    if not insights_data or not any(insights_data.values()):
        print(f"[{source_id}] Angle Strategist: Insights empty. Falling back to summary context.", file=sys.stderr)
        summary_path = get_safe_tmp_path('Unknown Source', f"summaries/{f"{source_id}_summary.json")
        summary_bundle = load_json(summary_path)
        if summary_bundle and summary_bundle.get("summary"):
            input_text = f"SOURCE SUMMARY (Fallback):\n{summary_bundle['summary']}"
        else:
            # Last resort: use the title
            input_text = f"SOURCE TITLE (Minimal context):\n{insights_bundle.get('title'}")}"

    # SPARSE CONTEXT GUARD: If input text is less than 500 characters, analysis is meaningless
    if len(input_text.strip()) < 500:
        msg = "Insufficient source context for strategic analysis. (Metadata and notes combined < 500 chars)"
        print(json.dumps({
            "status": "failed", 
            "error": msg,
            "error_code": "SPARSE_CONTEXT",
            "source_id": source_id
        }), file=sys.stderr)
        # Still write a failure artifact so the UI can catch it
        out_dir = get_safe_tmp_dir("angles")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_angle.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump({"status": "failed", "error": msg, "error_code": "SPARSE_CONTEXT", "source_id": source_id}, f, indent=2)
        sys.exit(1)
    
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
    
    CRITICAL RULE:
    The article must revolve around exactly ONE strong, non-generic central thesis.
    Example of a weak thesis: "AI is transforming industries."
    Example of a strong thesis: "AI gives small teams an asymmetric advantage over large corporations by collapsing the cost of specialized labor."
    
    Choose a specific, opinionated framing angle based on the insights provided.
    
    IMPORTANT: If USER INTENT SETTINGS provide a specific 'Format/Type', you MUST 
    output that exactly as the 'recommended_format'. Do NOT use 'Long-form Essay' 
    if the user requested 'blog_article' or 'technical_explainer'.
    
    Target the audience specified, or default to technical builders, engineers, and designers.
    CRITICAL: You MUST write your response entirely in the '{lang}' language.
    """
    
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
        
        out_dir = get_safe_tmp_dir("angles")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_angle.json")
        
        bundle = {
            "status": "success",
            "source_id": source_id,
            "data": json.loads(extracted_data.model_dump_json())
        }
        
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, indent=2)
            
        print(json.dumps(bundle))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Strategize an editorial angle from generated insights.")
    parser.add_argument("--input", required=True, help="Path to input insights JSON.")
    parser.add_argument("--type", help="Target content type/format.")
    parser.add_argument("--audience", help="Target audience.")
    parser.add_argument("--tone", help="Target tone.")
    
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    extract_angle(args.input, args.type, args.audience, args.tone, args.lang)
