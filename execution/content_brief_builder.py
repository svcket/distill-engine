import argparse
import sys
import json
import os
from openai import OpenAI
from pydantic import BaseModel

# Initialize OpenAI client 
client = OpenAI()

class ContentBrief(BaseModel):
    content_type: str
    audience: str
    tone: str
    goal: str
    reading_level: str
    seo_priority: str
    source_grounding_mode: str
    must_include: list[str]
    avoid_patterns: list[str]

def generate_content_brief(content_type: str, audience: str, tone: str) -> dict:
    """
    Generates a structured Content Brief based on user intent parameters.
    """
    system_prompt = """You are a master Editorial Content Strategist.
Your job is to take raw intent parameters (Content Type, Audience, Tone) and output a highly specific, actionable Content Brief for a writer.
This brief will dictate the structure, depth, and style of the final drafted piece.

Your goal is to ensure the resulting writing feels intentional, human-authored, and perfectly tailored to its target audience.
You must absolutely forbid generic AI writing markers (e.g., "In today's digital landscape", "In conclusion", "Furthermore", "pivotal transformation", "testament").
"""

    user_prompt = f"""Generate a comprehensive Content Brief for the following parameters:

- Content Type: {content_type}
- Target Audience: {audience}
- Desired Tone: {tone}

The brief must include:
1. `goal`: What is the primary purpose of this piece? (e.g., "explain a complex concept simply", "provide actionable frameworks for operators", "provoke thought")
2. `reading_level`: How dense/accessible should the text be? (e.g., "accessible to beginners but not patronizing", "dense with industry-specific terminology")
3. `seo_priority`: Low, Medium, or High (based on if it's a personal essay vs an educational blog post)
4. `source_grounding_mode`: How explicitly should the original source be referenced? (e.g., "Heavy direct quotes and rigorous citations", "Light conceptual grounding", "Implicit synthesis")
5. `must_include`: 3-5 specific structural or thematic elements the writer MUST include (e.g., "Clear central thesis driven by the source", "Practical real-world examples", "A strong, non-cheesy hook")
6. `avoid_patterns`: 4-6 specific things the writer MUST avoid (e.g., "generic AI phrasing", "academic filler", "corporate jargon", "overly balanced essay tone")
"""

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format=ContentBrief,
            temperature=0.2
        )
        
        brief_data = completion.choices[0].message.parsed
        if not brief_data:
            raise ValueError("Failed to parse Content Brief from OpenAI response.")
            
        return brief_data.model_dump()
        
    except Exception as e:
        print(f"Error generating Content Brief: {str(e)}", file=sys.stderr)
        # Fallback to a safe, generic brief
        return {
            "content_type": content_type,
            "audience": audience,
            "tone": tone,
            "goal": "Explain concepts clearly and interpret source material.",
            "reading_level": "Clear, professional, and accessible.",
            "seo_priority": "Medium",
            "source_grounding_mode": "Explicit but blended naturally.",
            "must_include": ["Strong central thesis", "Clear practical relevance"],
            "avoid_patterns": ["Generic AI phrasing", "Academic filler", "'In conclusion'"]
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a Writing Intent Content Brief")
    parser.add_argument("--source-id", required=True, help="Unique identifier for the source")
    parser.add_argument("--type", default="blog_article", help="Target content type")
    parser.add_argument("--audience", default="general_reader", help="Target audience")
    parser.add_argument("--tone", default="conversational", help="Desired tone")
    
    args = parser.parse_args()
    
    # Generate the brief
    print("Building Content Brief...", file=sys.stderr)
    brief = generate_content_brief(
        content_type=args.type, 
        audience=args.audience, 
        tone=args.tone
    )
    
    # Save to .tmp/briefs/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    briefs_dir = os.path.join(script_dir, '.tmp', 'briefs')
    os.makedirs(briefs_dir, exist_ok=True)
    
    output_path = os.path.join(briefs_dir, f"{args.source_id}_brief.json")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(brief, f, indent=2)
        
    # Print the JSON bundle to stdout
    print(json.dumps({
        "status": "success",
        "data": brief,
        "message": f"Content Brief generated for {args.type} aimed at {args.audience}."
    }))
