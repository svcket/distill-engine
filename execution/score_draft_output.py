"""
Draft Evaluation Engine.
Scores the final editorial draft based purely on density, clarity, and value.
Replaces the old "Source Judge" to ensure we grade outputs, not inputs.
"""

import sys
import argparse
import json
import os

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
        
    # The actual markdown content is nested in the data object depending on pipeline output format
    content = ""
    if "data" in draft_data and isinstance(draft_data["data"], dict):
        content = draft_data["data"].get("content", "")
    elif "content" in draft_data:
        content = draft_data.get("content", "")
        
    score = 5.0
    rationale = []
    
    word_count = len(content.split())
    
    if word_count < 200:
        score -= 2.0
        rationale.append("Draft is extremely sparse line-count.")
    elif word_count > 1500:
        score += 2.0
        rationale.append("High volume of substantive content.")
    elif word_count > 800:
        score += 1.0
        rationale.append("Strong editorial depth and word count.")
        
    # Check for structural artifacts
    if "##" in content:
        score += 1.0
        rationale.append("Good structural hierarchy.")
    if "- " in content or "* " in content:
        score += 0.5
        rationale.append("Contains structured lists/takeaways.")
    if "> " in content:
        score += 0.5
        rationale.append("Includes direct quotes or emphasized insights.")
        
    # Penalty for generic wrapper phrases
    generics = ["in conclusion", "to sum up", "it's important to remember that", "the key takeaway is"]
    for g in generics:
        if g in content.lower():
            score -= 0.5
            rationale.append("Contains generic LLM wrapper phrases.")
            
    # Compile
    score = round(max(1.0, min(10.0, score)), 1)
    
    if score >= 8.0:
        decision = "Excellent"
    elif score >= 6.0:
        decision = "Passable"
    else:
        decision = "Rejected"
        
    result = {
        "status": "success",
        "score": score,
        "decision": decision,
        "rationale": " ".join(rationale) if rationale else "Standard evaluation."
    }
    
    # Save evaluation
    out_dir = os.path.join(base, ".tmp", "evaluations")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{source_id}_eval.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        
    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    args = parser.parse_args()
    evaluate_draft(args.source_id)
