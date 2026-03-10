import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from typing import List
from openai import OpenAI

class Framework(BaseModel):
    title: str = Field(description="Name of the framework or model.")
    description: str = Field(description="Brief description of what the framework does.")

class InsightExtraction(BaseModel):
    thesis: str = Field(description="The overarching argument or point of the video.")
    key_ideas: List[str] = Field(description="The supporting pillars of the thesis.")
    frameworks: List[Framework] = Field(description="List of specific models or step-by-step systems mentioned.")
    examples: List[str] = Field(description="Anecdotes or data points used to prove concepts.")
    quotes: List[str] = Field(description="Exact, verbatim memorable lines.")
    takeaways: List[str] = Field(description="What should a builder actually do with this info?")
    tensions: List[str] = Field(description="Open questions or contradictions raised.")
    confidence_notes: str = Field(description="Notes on whether the content was dense or superficial.")

def load_json(filepath: str):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return None

def extract_insights(packet_path: str):
    if not os.path.exists(packet_path):
        print(json.dumps({"status": "failed", "error": f"Packet not found: {packet_path}"}), file=sys.stderr)
        sys.exit(1)
        
    packet = load_json(packet_path)
    video_id = packet.get("video_id")
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        # Mock fallback for UI testing without keys
        mock_result = {
            "status": "success_mocked",
            "video_id": video_id,
            "data": {
                "thesis": "Mock Thesis: Agentic systems require decoupled intelligence routing.",
                "frameworks": [{"title": "Agentic Loop", "description": "Observe, orient, decide, act."}],
                "quotes": ["This is a mock quote from the extraction engine."],
                "takeaways": ["Build generic wrappers before custom agents."]
            }
        }
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "insights")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_insights.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(mock_result, f, indent=2)
            
        print(json.dumps(mock_result))
        sys.exit(0)

    client = OpenAI()
    
    # We pass the refined transcript chunks to the context window
    transcript_text = "\n\n".join(
        [f"[{c.get('start', 0)}s]: {c.get('text', '')}" for c in packet.get("transcript_segments", [])]
    )
    
    system_prompt = """
    You are the Insight Extractor—a research journalist for a premium publication.
    Your task is to extract dense, structured knowledge from this raw transcript.
    
    CRITICAL RULES:
    1. Extract exactly one strong main thesis.
    2. Extract 3-5 key actionable insights.
    3. Identify and extract any frameworks, mental models, or step-by-step systems mentioned.
    4. Extract verbatim quotes that are highly impactful.
    5. Do NOT invent information. If the transcript is shallow, note it in confidence_notes.
    6. Prioritize technical builders and makers.
    """
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Extract insights from this transcript:\n\n{transcript_text[:90000]}"}
            ],
            response_format=InsightExtraction,
        )
        
        extracted_data = completion.choices[0].message.parsed
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "insights")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{video_id}_insights.json")
        
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
    parser = argparse.ArgumentParser(description="Extract structured knowledge from an insight packet.")
    parser.add_argument("--input", required=True, help="Path to input packet JSON.")
    
    args = parser.parse_args()
    extract_insights(args.input)
