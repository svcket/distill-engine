"""
Visual Planner — structural stub for future visual planning layer.
Runs after draft generation. Prepares suggested visual hooks without
implementing full visual automation yet.

Output structure is stable so the visual layer can be introduced later
without changing upstream pipeline stages.
"""

import sys
import argparse
import json
import os


def plan_visuals(source_id: str, draft_path: str = None):
    base = os.path.dirname(__file__)

    # Load draft if available
    draft = {}
    if draft_path and os.path.exists(draft_path):
        with open(draft_path, "r", encoding="utf-8") as f:
            draft = json.load(f)
    else:
        fallback = os.path.join(base, ".tmp", "drafts", f"{source_id}_draft.json")
        if os.path.exists(fallback):
            with open(fallback, "r", encoding="utf-8") as f:
                draft = json.load(f)

    draft_data = draft.get("data", {})
    title = draft_data.get("title", "")
    content = draft_data.get("content", "")

    # Extract candidate visual moments from content
    # (Future: LLM-powered visual hook extraction)
    sections = [line.strip() for line in content.split("\n") if line.startswith("## ")]
    quotes = [line.strip().lstrip("> ") for line in content.split("\n") if line.startswith("> ")]

    visual_plan = {
        "source_id": source_id,
        "status": "stub",  # Not yet automated — marks readiness for future layer
        "visual_suggestions": [
            {
                "type": "cover_image",
                "description": f"Full-width hero image representing: {title}",
                "prompt_hint": title,
                "ready": False,
            },
            *[
                {
                    "type": "section_divider",
                    "description": f"Visual break for section: {s}",
                    "prompt_hint": s,
                    "ready": False,
                }
                for s in sections[:3]
            ],
            *[
                {
                    "type": "quote_card",
                    "description": f"Pull quote card",
                    "content": q[:120],
                    "ready": False,
                }
                for q in quotes[:2]
            ],
            {
                "type": "diagram",
                "description": "Explanatory diagram for core concept — to be defined from insights.",
                "ready": False,
            }
        ],
        "automation_status": "pending",
        "note": "Visual automation not yet implemented. This stub ensures the pipeline slot exists for future integration.",
    }

    out_dir = os.path.join(base, ".tmp", "visual_plans")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{source_id}_visual_plan.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(visual_plan, f, indent=2)

    print(json.dumps({
        "status": "success",
        "source_id": source_id,
        "plan_path": out_path,
        "suggestion_count": len(visual_plan["visual_suggestions"]),
        "automation_status": "pending",
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate visual planning stub for a draft.")
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--draft-path", default=None)
    args = parser.parse_args()
    plan_visuals(args.source_id, args.draft_path)
