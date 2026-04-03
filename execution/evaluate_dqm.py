"""
Distill Quality Matrix (DQM) Evaluator.
Evaluates drafts across 7 editorial dimensions:
1. Source Grounding
2. Insight Density
3. Humanness
4. Clarity
5. Structural Quality
6. SEO Score
7. AEO Score
Produces a weighted Publishability Score.
"""

import sys
import argparse
import json
import os
import re
from pydantic import BaseModel, Field
from openai import OpenAI
from typing import List, Dict
from supabase_utils import upload_artifact

class DQMMetrics(BaseModel):
    source_grounding: int = Field(description="Score 0-100 on how strongly the draft reflects the original source/brief.")
    insight_density: int = Field(description="Score 0-100 on idea density vs generic filler.")
    humanness: int = Field(description="Score 0-100 on sounding human, avoiding AI patterns/cliches.")
    clarity: int = Field(description="Score 0-100 on readability and logical progression.")
    structure: int = Field(description="Score 0-100 on editorial structure (hook, thesis, flow).")
    seo: int = Field(description="Score 0-100 on search engine readiness (keywords, hierarchy).")
    aeo: int = Field(description="Score 0-100 on Answer Engine Optimization (extractability).")
    strengths: List[str] = Field(description="List of positive editorial signals.")
    risks: List[str] = Field(description="List of editorial weaknesses or hallucination risks.")
    suggestions: List[str] = Field(description="Actionable improvements.")
    rationale: str = Field(description="A concise summary explaining the scores and the overall publishability decision.")

def _persist_evaluation(source_id: str, result: Dict, base_dir: str):
    """
    Shared helper to save evaluation result to disk and upload to cloud storage.
    Ensures the JSON is wrapped in a 'payload' envelope for web-side hydration.
    """
    eval_dir = os.path.join(base_dir, ".tmp", "evaluations")
    os.makedirs(eval_dir, exist_ok=True)
    
    eval_path = os.path.join(eval_dir, f"{source_id}_eval.json")
    
    # HYDRATION WRAPPER: Web side (StorageAdapter) expects a 'payload' or 'data' key
    final_json = {
        "status": "success",
        "timestamp": os.environ.get("TIMESTAMP", ""),
        "payload": result,
        "source_id": source_id
    }
    
    with open(eval_path, "w", encoding="utf-8") as f:
        json.dump(final_json, f, indent=2)
    
    # Cloud Bridge
    upload_artifact("evaluations", source_id, eval_path)
    return final_json

def evaluate_dqm(source_id: str):
    base = os.path.dirname(__file__)
    draft_file = os.path.join(base, ".tmp", "drafts", f"{source_id}_draft.json")
    
    if not os.path.exists(draft_file):
        print(json.dumps({
            "status": "failed", 
            "error": f"Draft file not found at {draft_file}. Please generate the draft first.",
            "source_id": source_id
        }), file=sys.stderr)
        sys.exit(1)
        
    with open(draft_file, "r", encoding="utf-8") as f:
        draft_bundle = json.load(f)
        
    # Content extraction
    if isinstance(draft_bundle, dict):
        data_payload = draft_bundle.get("data", {})
        if isinstance(data_payload, dict):
            content = data_payload.get("content") or data_payload.get("text") or ""
        else:
            content = ""
            
        if not content:
            content = draft_bundle.get("content") or draft_bundle.get("text") or ""
            
        if not content and "draft" in draft_bundle:
            draft_obj = draft_bundle["draft"]
            if isinstance(draft_obj, dict):
                content = draft_obj.get("content") or draft_obj.get("text") or ""
            elif isinstance(draft_obj, str):
                content = draft_obj
    else:
        content = str(draft_bundle)

    # SAFETY CHECK: Fail early if content is empty or only whitespace
    if not content or not content.strip():
        print(json.dumps({
            "status": "failed",
            "error": "Extracted content is empty. Cannot evaluate an empty draft.",
            "source_id": source_id
        }), file=sys.stderr)
        sys.exit(1)
    
    # Load brief for grounding context
    brief_file = os.path.join(base, ".tmp", "briefs", f"{source_id}_brief.json")
    brief_content = ""
    if os.path.exists(brief_file):
        with open(brief_file, "r", encoding="utf-8") as f:
            brief_content = f.read()

    deterministic = calculate_deterministic_metrics(content)
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        # Mocking DQM if no key
        result = {
            "scores": {
                "source_grounding": 85,
                "insight_density": 72,
                "humanness": 65,
                "clarity": 90,
                "structure": 80,
                "seo": 75,
                "aeo": 82,
                "publishability": 78,
                "total_score": 78
            },
            "total_score": 78,
            "strengths": ["Clear section hierarchy (Mock)", "Strong readability", "Good word count volume"],
            "risks": ["Predictable AI rhythmic patterns", "Generic conclusion wrapper"],
            "suggestions": ["Introduce more transition variety", "Replace 'In conclusion' with a summary insight"]
        }
        final_json = _persist_evaluation(source_id, result, base)
        print(json.dumps(final_json))
        return

    client = OpenAI()
    
    system_prompt = f"""You are the Distill Quality Matrix (DQM) Analyst.
Evaluate the provided draft strictly and accurately across 7 dimensions (0-100).

DETERMINISTIC DATA:
- Word Count: {deterministic['word_count']}
- Headings: {deterministic['heading_count']}
- Cliches Found: {deterministic['cliche_count']}
- Sentence Variation: {deterministic['sentence_variation']}

SCORING RULES:
90-100: Exceptional, human-grade, publish-ready.
70-89: Solid, but needs minor polish.
50-69: Average, needs significant editorial intervention.
Below 50: Weak, failed logic or excessive AI artifacts.

COMPOSITE WEIGHTS:
20% Grounding, 15% Insight, 15% Humanness, 10% Clarity, 10% Structure, 15% SEO, 15% AEO.
"""

    user_prompt = f"""DRAFT CONTENT:
{content}

BRIEF CONTEXT:
{brief_content[:2000]}
"""

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=DQMMetrics,
        )
        
        extracted = completion.choices[0].message.parsed
        
        publishability = int(
            (extracted.source_grounding * 0.20) +
            (extracted.insight_density * 0.15) +
            (extracted.humanness * 0.15) +
            (extracted.clarity * 0.10) +
            (extracted.structure * 0.10) +
            (extracted.seo * 0.15) +
            (extracted.aeo * 0.15)
        )
        
        result = {
            "scores": {
                "source_grounding": extracted.source_grounding,
                "insight_density": extracted.insight_density,
                "humanness": extracted.humanness,
                "clarity": extracted.clarity,
                "structure": extracted.structure,
                "seo": extracted.seo,
                "aeo": extracted.aeo,
                "publishability": publishability,
                "total_score": publishability
            },
            "total_score": publishability,
            "suggestions": extracted.suggestions,
            "rationale": extracted.rationale
        }
        
        final_json = _persist_evaluation(source_id, result, base)
        print(json.dumps(final_json))
        
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate a draft via DQM Matrix.")
    parser.add_argument("--source-id", "--video-id", dest="source_id", required=True)
    args = parser.parse_args()
    evaluate_dqm(args.source_id)
