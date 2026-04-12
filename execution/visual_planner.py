from fs_utils import get_safe_tmp_dir, get_safe_tmp_path
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
import requests
from pydantic import BaseModel, Field
from openai import OpenAI


class VisualSuggestion(BaseModel):
    type: str = Field(
        description="The type of visual (cover_image, atmospheric_divider, technical_diagram, quote_card)."
    )
    description: str = Field(description="A brief description for the user.")
    prompt: str = Field(description="The highly detailed prompt for the generation engine.")
    engine: str = Field(
        description="The chosen engine: 'dalle-3' for atmospheric, 'nano-banana' for technical/structured."
    )
    reasoning: str = Field(description="Why this engine was chosen for this hook.")
    image_url: str = Field(default=None, description="The local URL of the generated image.")

class VisualManifest(BaseModel):
    suggestions: list[VisualSuggestion]


def plan_visuals(source_id: str, draft_path: str = None, execute: bool = False, lang: str = "en"):
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
    title = draft_data.get("title", "Untitled Draft")
    content = draft_data.get("content", "")

    visual_suggestions = []

    if os.environ.get("OPENAI_API_KEY"):
        try:
            client = OpenAI()
            safe_lang = (lang or "en").strip() or "en"
            if len(safe_lang) > 10 or not all(c.isalnum() or c in '-' for c in safe_lang):
                safe_lang = "en"

            system_prompt = f"""You are a Visual Director for Distill, a premium editorial engine.
Your goal is to identify high-impact visual hooks in a text draft.

ASSIGNMENT RULES:
1. **DALL-E 3**: Use for covers and atmospheric dividers. Artistic and evocative.
2. **Nano Banana**: Use for technical diagrams and logical flows. Precise and structured.

 Identify 4-6 compelling hooks:
- One core 'cover_image' (Description: "Suggested AI Prompt for Hero Image").
- 2-3 'section_dividers' (Description: "Suggested AI Prompt for Section Visual").
- 1 'technical_diagram' (Description: "Suggested AI Prompt for Technical Diagram").
- 1 'quote_card' (Description: "Suggested AI Prompt for Quote Graphic").

The 'prompt' field should be a highly detailed, self-contained description 
suitable for direct input into DALL-E 3 or Nano Banana.

Output strictly in the required JSON format.
CRITICAL: You MUST write your response entirely in the '{safe_lang}' language."""

            user_prompt = f"DRAFT TITLE: {title}\n\nDRAFT CONTENT:\n{content}"

            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=VisualManifest,
            )
            manifest = completion.choices[0].message.parsed
            visual_suggestions = [s.model_dump() for s in manifest.suggestions]
        except Exception as e:
            print(f"LLM Visual Planning failed: {e}", file=sys.stderr)
            # Fallback to heuristic
    
    if not visual_suggestions:
        # Heuristic-based fallback (Supports both Markdown and HTML)
        sections = []
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("## "):
                sections.append(line.replace("## ", ""))
            elif line.startswith("<h2>") and "</h2>" in line:
                sections.append(line.replace("<h2>", "").replace("</h2>", ""))
        
        # Simple heuristic: If section title contains "tech", "system", "how", "process" -> nano-banana
        def get_engine(text: str):
            tech_keywords = [
                "how", "process", "system", "architecture", "structure", 
                "data", "technical", "logic", "reasoning", "steps"
            ]
            if any(k in text.lower() for k in tech_keywords):
                return "nano-banana"
            return "dalle-3"

        visual_suggestions = [
            {
                "type": "cover_image",
                "description": f"Suggested AI Prompt for {title} Hero Image",
                "prompt": (f"A cinematic, premium editorial cover image representing {title}. "
                           "High resolution, minimalist aesthetic, professional photography style."),
                "engine": "dalle-3",
                "reasoning": "Standard hero imagery is best handled by DALL-E."
            }
        ]
        
        if sections:
            for s in sections[:4]:
                engine = get_engine(s)
                visual_suggestions.append({
                    "type": "section_divider",
                    "description": f"Suggested AI Prompt for {s} Visual",
                    "prompt": (f"A sophisticated {engine} visualization of '{s}'. "
                               "Focus on professional clarity, minimalist design, and editorial aesthetic."),
                    "engine": engine,
                    "reasoning": f"Heuristic selection based on '{s}' content."
                })

    visual_plan = {
        "source_id": source_id,
        "status": "planned" if not execute else "generated",
        "visual_suggestions": visual_suggestions,
        "automation_status": "ready" if not execute else "completed",
        "note": ("Visual hooks extracted and mapped to prioritized engines."
                 if not execute else "Visual assets generated and stored locally."),
    }

    # EXECUTION LOGIC
    if execute and os.environ.get("OPENAI_API_KEY"):
        client = OpenAI()
        public_dir = os.path.join(base, "..", "web", "public", "visuals", source_id)
        os.makedirs(public_dir, exist_ok=True)
        
        print(f"Executing generation for {len(visual_suggestions)} hooks...", file=sys.stderr)
        
        for i, suggestion in enumerate(visual_suggestions):
            if suggestion.get("engine") == "dalle-3" and suggestion.get("prompt"):
                try:
                    msg = f"Generating image {i+1}/{len(visual_suggestions)}: {suggestion['type']}..."
                    print(msg, file=sys.stderr)
                    response = client.images.generate(
                        model="dall-e-3",
                        prompt=suggestion["prompt"],
                        size="1024x1024",
                        quality="standard",
                        n=1,
                    )
                    image_url = response.data[0].url
                    
                    # Download and save
                    img_data = requests.get(image_url).content
                    filename = f"visual_{i}.png"
                    file_path = os.path.join(public_dir, filename)
                    
                    with open(file_path, 'wb') as handler:
                        handler.write(img_data)
                    
                    suggestion["image_url"] = f"/visuals/{source_id}/{filename}"
                    print(f"Saved to {suggestion['image_url']}", file=sys.stderr)
                    
                except Exception as e:
                    print(f"Failed to generate image for hook {i}: {e}", file=sys.stderr)

    out_dir = get_safe_tmp_dir("visual_plans")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{source_id}_visual_plan.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(visual_plan, f, indent=2)

    # Cloud Bridge: Mirror visual plan to Supabase Storage
    try:
        from supabase_utils import upload_artifact
        upload_artifact("visual_plans", source_id, out_path)
    except Exception as e:
        print(f"[{source_id}] Visual plan cloud sync skipped: {e}", file=sys.stderr)


    print(json.dumps({
        "status": "success",
        "source_id": source_id,
        "plan_path": out_path,
        "result": visual_plan,
        "suggestion_count": len(visual_plan["visual_suggestions"]),
        "automation_status": "pending",
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate visual planning stub for a draft.")
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--draft-path", default=None)
    parser.add_argument("--execute", action="store_true", help="Actually generate images via API.")
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    plan_visuals(args.source_id, args.draft_path, args.execute, args.lang)
