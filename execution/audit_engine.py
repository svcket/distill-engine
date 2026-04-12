import sys
import argparse
import json
import os
import re
from typing import List, Dict

"""
Agency Audit Engine (Layer 3 Hardening)
Performs deterministic and probabilistic quality scoring across Agency projects.
"""

def dqm_score_content(content: str, rules: Dict) -> Dict:
    scores = {}
    words = content.split()
    word_count = len(words)
    
    # 1. Intelligence Density (More strict)
    # 50 words is not a transcript. 500 words is a minimum viable intelligence.
    # We penalize below 300 words heavily.
    scores['insight_density'] = min(100, (word_count / 15))
    
    sentences = re.split(r'[.!?]+', content)
    avg_sentence_len = word_count / max(1, len(sentences))
    scores['clarity'] = max(0, min(100, 100 - abs(avg_sentence_len - 15)))
    
    forbidden = ["I think", "I believe", "maybe", "sorry"]
    hits = [f for f in forbidden if f in content]
    scores['professionalism'] = max(0, 100 - (len(hits) * 20))
    
    # 2. Penalty Rubric
    penalty = 0
    reason = "High fidelity intelligence detected."
    
    # HARD PENALTY: Low Signal
    if word_count < 150:
        penalty = 60
        reason = "Low-Signal Context: Content appears to be metadata/description only. Full transcript missing."
    elif word_count < 400:
        penalty = 30
        reason = "Partial Intelligence: Text is brief. Narrative detail may be limited."

    weighted = (scores['clarity'] * 0.4) + (scores['insight_density'] * 0.3) + (scores['professionalism'] * 0.3)
    final_score = max(0, weighted - penalty)
    
    return {
        "overall_score": round(final_score, 2),
        "breakdown": scores,
        "metrics": {
            "word_count": word_count,
            "sentence_count": len(sentences),
            "avg_sentence_len": round(avg_sentence_len, 2)
        },
        "status": "PASS" if final_score > 65 else "FAIL",
        "status_reason": reason
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--project", default="general")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({"error": f"File {args.file} not found"}))
        sys.exit(1)

    with open(args.file, "r") as f:
        content = f.read()

    result = dqm_score_content(content, {})
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()

# Quality Gate Update: Sun Apr 12 13:57:12 WAT 2026
