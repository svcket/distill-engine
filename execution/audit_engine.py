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
    
    sentences = re.split(r'[.!?]+', content)
    avg_sentence_len = word_count / max(1, len(sentences))
    scores['clarity'] = max(0, min(100, 100 - abs(avg_sentence_len - 15)))
    scores['insight_density'] = min(100, (word_count / 10))
    
    forbidden = ["I think", "I believe", "maybe", "sorry"]
    hits = [f for f in forbidden if f in content]
    scores['professionalism'] = max(0, 100 - (len(hits) * 20))
    
    weighted = (scores['clarity'] * 0.4) + (scores['insight_density'] * 0.3) + (scores['professionalism'] * 0.3)
    
    return {
        "overall_score": round(weighted, 2),
        "breakdown": scores,
        "metrics": {
            "word_count": word_count,
            "sentence_count": len(sentences),
            "avg_sentence_len": round(avg_sentence_len, 2)
        },
        "status": "PASS" if weighted > 70 else "FAIL"
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
