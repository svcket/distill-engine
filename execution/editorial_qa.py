"""
Editorial QA Evaluator.
Scores the final draft across 6 editorial categories using OpenAI structured outputs.
Categories (1-10): Source grounding, Clarity, Original insight, Human tone, SEO structure, Specificity.
Total: 60 points (>=50 Publishable, 40-49 Revise, <40 Reject).
"""

import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from openai import OpenAI

class EditorialEvaluation(BaseModel):
    source_grounding: int = Field(description="Score 1-10 on explicit referencing of the source material.")
    clarity: int = Field(description="Score 1-10 on clear, concise writing.")
    original_insight: int = Field(description="Score 1-10 on strength and non-generic nature of the central thesis.")
    human_tone: int = Field(description="Score 1-10 on sounding confident, avoiding academic filler/corporate jargon.")
    seo_structure: int = Field(description="Score 1-10 on having short paragraphs, strong subheadings, and scannability.")
    specificity: int = Field(description="Score 1-10 on using exact quotes, tangible examples, and frameworks.")
    feedback: str = Field(description="Targeted revision instructions based on the lowest scoring categories.")

def evaluate_draft(source_id: str):
    base = os.path.dirname(__file__)
    draft_file = os.path.join(base, ".tmp", "drafts", f"{source_id}_draft.json")
    
    if not os.path.exists(draft_file):
        print(json.dumps({
            "status": "error",
            "error_detail": f"Draft for '{source_id}' not found. Pipeline must reach Draft stage first."
        }), file=sys.stderr)
        sys.exit(1)
        
    try:
        with open(draft_file, "r", encoding="utf-8") as f:
            draft_data = json.load(f)
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)
        
    content = ""
    if "data" in draft_data and isinstance(draft_data["data"], dict):
        content = draft_data["data"].get("content", "")
    elif "content" in draft_data:
        content = draft_data.get("content", "")

    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        # Mock evaluation
        total_score = 52
        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "data": {
                "source_grounding": 9,
                "clarity": 8,
                "original_insight": 8,
                "human_tone": 9,
                "seo_structure": 10,
                "specificity": 8,
                "feedback": "Mock feedback: The draft looks solid. Good source grounding.",
                "total_score": total_score,
                "decision": "Publishable"
            }
        }
        _save_evaluation(source_id, mock_result)
        print(json.dumps(mock_result))
        return

    client = OpenAI()
    
    system_prompt = """
    You are the Senior Editorial Reviewer for Distill. Evaluate this article draft based on 6 standards.
    Score each category from 1 to 10 strictly. Standard AI outputs usually score around 5-6. Only award 9-10 for exceptional quality.
    
    Categories:
    1. Source Grounding: Does it explicitly cite the source? Does it feel anchored in a specific talk/article?
    2. Clarity: Is the logic easy to follow?
    3. Original Insight: Is the central thesis strong or vague/generic?
    4. Human Tone: Short paragraphs? Confident? Free of jargon like 'pivotal transformation' or 'in conclusion'?
    5. SEO Structure: Scannable? Strong subheadings?
    6. Specificity: Does it use tangible examples and actual frameworks mentioned in the source?
    """

    user_prompt = f"""Review the following draft:
    
{content}
"""

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=EditorialEvaluation,
        )
        
        extracted = completion.choices[0].message.parsed
        total_score = (
            extracted.source_grounding + 
            extracted.clarity + 
            extracted.original_insight + 
            extracted.human_tone + 
            extracted.seo_structure + 
            extracted.specificity
        )
        
        decision = "Reject"
        if total_score >= 50:
            decision = "Publishable"
        elif total_score >= 40:
            decision = "Revise"
            
        bundle = {
            "status": "success",
            "source_id": source_id,
            "data": {
                "source_grounding": extracted.source_grounding,
                "clarity": extracted.clarity,
                "original_insight": extracted.original_insight,
                "human_tone": extracted.human_tone,
                "seo_structure": extracted.seo_structure,
                "specificity": extracted.specificity,
                "feedback": extracted.feedback,
                "total_score": total_score,
                "decision": decision
            }
        }
        
        _save_evaluation(source_id, bundle)
        print(json.dumps(bundle))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)

def _save_evaluation(source_id: str, bundle: dict):
    base = os.path.dirname(__file__)
    out_dir = os.path.join(base, ".tmp", "evaluations")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{source_id}_eval.json"), "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate a draft editorially.")
    parser.add_argument("--source-id", required=True)
    args = parser.parse_args()
    evaluate_draft(args.source_id)
