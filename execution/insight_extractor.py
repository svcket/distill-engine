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
    core_argument: str = Field(description="The singular, overarching argument or point of the source.")
    key_claims: List[str] = Field(description="The primary claims or assertions that support the core argument.")
    supporting_examples: List[str] = Field(description="Concrete historical cases, data points, or anecdotes used as proof.")
    frameworks: List[Framework] = Field(description="Specific models, metrics, or step-by-step systems mentioned.")
    controversies: List[str] = Field(description="Debates, tensions, or controversial views raised by the source.")
    contradictions: List[str] = Field(description="Any contradictions or counterintuitive points made.")
    implications: List[str] = Field(description="The 'so what?'-the second-order effects of the claims.")
    memorable_quotes: List[str] = Field(description="Exact, verbatim impactful lines.")
    speaker_identity: str = Field(description="Who is speaking or who authored this source? (Name, role, or assumed identity if not explicitly stated).")
    source_context: str = Field(description="The overarching theme, publication, or platform context of this knowledge.")

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
    source_id = packet.get("source_id") or packet.get("video_id")
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        # Mock fallback for UI testing without keys
        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "data": {
                "core_argument": "Mock Argument: Agentic systems require decoupled intelligence routing.",
                "key_claims": ["Monolithic agents fail at scale", "Routing determines system reliability"],
                "supporting_examples": ["The 2024 AI agent crash", "Using decoupled orchestration layers"],
                "frameworks": [{"title": "Agentic Loop", "description": "Observe, orient, decide, act."}],
                "controversies": ["Are LLMs necessary for basic routing?"],
                "contradictions": ["Faster models aren't always better orchestrators."],
                "implications": ["End-user applications will become primarily declarative."],
                "memorable_quotes": ["This is a mock quote from the extraction engine."],
                "speaker_identity": "Senior System Architect / AI Researcher",
                "source_context": "Technical presentation on modern AI infrastructure"
            }
        }
        
        out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "insights")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_insights.json")
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
    You are the Insight Extractor—a research analyst for a premium editorial publication.
    Your task is to extract dense, structured, and interpretive knowledge from this raw transcript.
    
    CRITICAL RULES:
    1. Extract exactly one strong core argument (the thesis).
    2. Extract the key claims that serve as the pillars of that argument.
    3. Ground the extraction in SPECIFICITY. Identify concrete examples and data.
    4. Interpret the text: pull out controversies, contradictions, and broader implications.
    5. Do NOT invent information. If the transcript is shallow, output empty arrays for missing concepts.
    6. Extract verbatim memorable quotes.
    7. Capture the speaker identity and the broader context of the source material.
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
        out_path = os.path.join(out_dir, f"{source_id}_insights.json")
        
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
    parser = argparse.ArgumentParser(description="Extract structured knowledge from an insight packet.")
    parser.add_argument("--input", required=True, help="Path to input packet JSON.")
    
    args = parser.parse_args()
    extract_insights(args.input)
