import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from typing import List
from openai import OpenAI

class AngleStrategy(BaseModel):
    recommended_format: str = Field(description="Primary format (e.g., 'Long-form Essay', 'X Thread')")
    secondary_formats: List[str] = Field(description="Alternative formats that fit well.")
    target_audience: str = Field(description="Who is this for?")
    framing_angle: str = Field(description="The central hook or narrative angle.")
    working_titles: List[str] = Field(description="3-5 punchy title ideas.")
    rationale: str = Field(description="Why this angle?")

def extract_angle(insights_path: str, target_type: str = None, target_audience: str = None, target_tone: str = None):
    if not os.path.exists(insights_path):
        print(json.dumps({"status": "failed", "error": f"Insights not found: {insights_path}"}), file=sys.stderr)
        sys.exit(1)
        
    with open(insights_path, 'r', encoding='utf-8') as f:
        insights_bundle = json.load(f)
        
    source_id = insights_bundle.get("source_id") or insights_bundle.get("video_id")
    insights_data = insights_bundle.get("data", {})
    
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
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "angles")
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
    
    Choose a specific, opinionated framing angle based on the insights provided and the USER INTENT SETTINGS if present.
    Target the audience specified, or default to technical builders, engineers, and designers.
    """
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Strategize an angle for these insights:\n\n{json.dumps(insights_data)}"}
            ],
            response_format=AngleStrategy,
        )
        
        extracted_data = completion.choices[0].message.parsed
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "angles")
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
    
    args = parser.parse_args()
    extract_angle(args.input, args.type, args.audience, args.tone)
