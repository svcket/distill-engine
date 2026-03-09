import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from openai import OpenAI

class WrittenDraft(BaseModel):
    title: str = Field(description="The finalized title of the piece.")
    content: str = Field(description="The full Markdown body of the piece.")
    word_count: int = Field(description="The total word count of the generated markup.")

def generate_draft(outline_path: str, insights_path: str):
    if not os.path.exists(outline_path) or not os.path.exists(insights_path):
        print(json.dumps({"status": "failed", "error": "Missing input payloads."}), file=sys.stderr)
        sys.exit(1)
        
    with open(outline_path, 'r', encoding='utf-8') as fo:
        outline_bundle = json.load(fo)
        
    with open(insights_path, 'r', encoding='utf-8') as fi:
        insights_bundle = json.load(fi)
        
    video_id = outline_bundle.get("video_id")
    outline_data = outline_bundle.get("data", {})
    insights_data = insights_bundle.get("data", {})
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        mock_result = {
            "status": "success_mocked",
            "video_id": video_id,
            "data": {
                "title": outline_data.get("title", "Mock Title"),
                "content": "# Mock Content\n\nThis is a mocked generated draft. If you want the real LLM writer to execute, provide the OPENAI_API_KEY environment variable. \n\n## Section 1\nIt proves the backend python runner loop for `writer.py` functions correctly.",
                "word_count": 35
            }
        }
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "drafts")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_draft.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(mock_result, f, indent=2)
            
        print(json.dumps(mock_result))
        sys.exit(0)

    client = OpenAI()
    
    system_prompt = """
    You are the Senior Writer Agent. You receive a strict structural blueprint and a deep set of grounded insights.
    Your job is to execute the outline flawlessly and write the content.
    Adopt a premium, high-signal, high-density tone. Do not use generic filler words.
    Format the output strictly as clear Markdown.
    """
    
    user_prompt = f"""
    Structural Blueprint:
    {json.dumps(outline_data)}
    
    Grounded Insights to source from:
    {json.dumps(insights_data)}
    
    Generate the final piece.
    """
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=WrittenDraft,
        )
        
        extracted_data = completion.choices[0].message.parsed
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "drafts")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_draft.json")
        
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
    parser = argparse.ArgumentParser(description="Generate a written draft from outlines and insights.")
    parser.add_argument("--outline_input", required=True, help="Path to structural outline JSON.")
    parser.add_argument("--insights_input", required=True, help="Path to insights JSON.")
    
    args = parser.parse_args()
    generate_draft(args.outline_input, args.insights_input)
