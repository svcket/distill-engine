import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from typing import List
from openai import OpenAI

class SectionBlueprint(BaseModel):
    heading: str = Field(description="The section heading.")
    word_count_target: int = Field(description="Target word count for this section.")
    purpose: str = Field(description="The narrative purpose of this section.")
    key_points: List[str] = Field(description="Bullet points of what must be covered here.")

class ArticleArchitecture(BaseModel):
    title: str = Field(description="The final chosen title.")
    format: str = Field(description="The format (e.g., Essay, Thread).")
    total_word_count_target: int = Field(description="Estimated total word length.")
    sections: List[SectionBlueprint] = Field(description="The structural blueprint.")

def generate_blueprint(angle_path: str, insights_path: str):
    if not os.path.exists(angle_path) or not os.path.exists(insights_path):
        print(json.dumps({"status": "failed", "error": "Missing input payloads."}), file=sys.stderr)
        sys.exit(1)
        
    with open(angle_path, 'r', encoding='utf-8') as fa:
        angle_bundle = json.load(fa)
        
    with open(insights_path, 'r', encoding='utf-8') as fi:
        insights_bundle = json.load(fi)
        
    video_id = angle_bundle.get("video_id")
    angle_data = angle_bundle.get("data", {})
    insights_data = insights_bundle.get("data", {})
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        mock_result = {
            "status": "success_mocked",
            "video_id": video_id,
            "data": {
                "title": angle_data.get("working_titles", ["Mock Final Title"])[0],
                "format": angle_data.get("recommended_format", "Essay"),
                "total_word_count_target": 800,
                "sections": [
                    {
                        "heading": "Introduction: The Hook",
                        "word_count_target": 150,
                        "purpose": "Establish the premise",
                        "key_points": ["State the thesis clearly."]
                    },
                    {
                        "heading": "The Core Framework",
                        "word_count_target": 400,
                        "purpose": "Explain the mechanics",
                        "key_points": ["Detail the system logic.", "Provide an example."]
                    },
                    {
                        "heading": "Takeaways",
                        "word_count_target": 250,
                        "purpose": "Actionable conclusion",
                        "key_points": ["Summarize rules."]
                    }
                ]
            }
        }
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "outlines")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_outline.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(mock_result, f, indent=2)
            
        print(json.dumps(mock_result))
        sys.exit(0)

    client = OpenAI()
    
    system_prompt = """
    You are the Article Architect. Your job is to take an editorial angle and the raw extracted insights,
    and build a rigid structural blueprint for the final written piece.
    Provide precise section headings, word count targets, and the key narrative beats for each section.
    """
    
    user_prompt = f"""
    Strategic Angle:
    {json.dumps(angle_data)}
    
    Raw Insights:
    {json.dumps(insights_data)}
    
    Generate the blueprint.
    """
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=ArticleArchitecture,
        )
        
        extracted_data = completion.choices[0].message.parsed
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "outlines")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_outline.json")
        
        bundle = {
            "status": "success",
            "video_id": video_id,
            "data": json.loads(extracted_data.model_dump_json())
        }
        
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, indent=2)
            
        print(json.dumps(bundle))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate an architectural text outline from angles and insights.")
    parser.add_argument("--angle_input", required=True, help="Path to angle strategy JSON.")
    parser.add_argument("--insights_input", required=True, help="Path to insights JSON.")
    
    args = parser.parse_args()
    generate_blueprint(args.angle_input, args.insights_input)
