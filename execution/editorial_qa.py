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

    # Load Brief Data for intent-aware QA
    brief_file = os.path.join(base, ".tmp", "briefs", f"{source_id}_brief.json")
    brief_data = {}
    if os.path.exists(brief_file):
        try:
            with open(brief_file, "r", encoding="utf-8") as f:
                brief_bundle = json.load(f)
                brief_data = brief_bundle.get("data", {})
        except Exception:
            pass

    content_type = brief_data.get("content_type", "blog article")
    audience = brief_data.get("audience", "general reader")
    tone = brief_data.get("tone", "conversational")
    goal = brief_data.get("goal", "explain clearly")
    avoid_patterns = brief_data.get("avoid_patterns", [])

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
                "decision": "Publish Ready"
            }
        }
        _save_evaluation(source_id, mock_result)
        print(json.dumps(mock_result))
        return

    client = OpenAI()
    
    system_prompt = f"""You are the Senior Editorial Reviewer for Distill. Evaluate this draft based on 6 standards.
Score each category strictly from 1 to 10. AI outputs usually score 5-6. Only award 9-10 for exceptional human-grade quality.

CRITICAL INTENT CONTEXT:
This piece is intended to be a **{content_type}** for a **{audience}**.
The tone should be **{tone}**.
The primary goal is to **{goal}**.

CONTEXTUAL EVALUATION CRITERIA:
Because this is a {content_type}, you MUST apply the following contextual scoring lenses. Do NOT penalize a piece for lacking academic structure if it is not an academic piece.
- If "Blog Article": Focus heavily on Clarity, narrative flow, accessibility, and SEO structure.
- If "Essay" or "Thematic Essay": Focus heavily on Original Insight, argument strength, and reflection. Direct quotes are nice but not strictly required if synthesis is strong.
- If "Technical Breakdown" or "Explainer": Focus heavily on Specificity, accuracy, and clear examples. Density matters.
- If "Source Analysis": Focus heavily on Source Grounding.

Evaluate these 6 Categories explicitly reflecting the context above:
1. Source Grounding: Does it confidently anchor to the source?
2. Clarity: Is the logic easy to follow according to the reading level of the {audience}?
3. Original Insight: Is the central thesis strong or vague?
4. Human Tone: Does it sound confident? Did it avoid robotic AI cliches like "In today's rapidly evolving landscape" or {', '.join(avoid_patterns)}?
5. SEO Structure: Is it scannable with strong subheadings (if public-facing)?
6. Specificity: Does it use tangible examples and real frameworks?
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
        
        # New flexible editorial verdicts
        decision = "Reject"
        if total_score >= 54:
            decision = "Publish Ready"
        elif total_score >= 48:
            decision = "Minor Improvements Suggested"
        elif total_score >= 40:
            decision = "Needs Revision"
        elif total_score >= 30:
            decision = "Major Rewrite Required"
            
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
