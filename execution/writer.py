"""
Writer — generates draft articles from outline + insights.
Supports streaming output for progressive UI rendering.
"""

import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from openai import OpenAI


class WrittenDraft(BaseModel):
    title: str = Field(description="The finalized title of the piece.")
    content: str = Field(description="The full Markdown body of the piece.")
    word_count: int = Field(description="The total word count of the generated content.")

class ContentPlan(BaseModel):
    thesis_frame: str = Field(description="The central thesis grounded in tension or contrast.")
    editorial_angle: str = Field(description="The chosen angle (Explainer, Cultural Analysis, Case Study, etc.).")
    voice_persona: str = Field(description="The selected authorial voice (Analyst, Storyteller, Builder, etc.).")
    structure_architecture: list[str] = Field(description="The narrative flow (Hook -> Context -> Observation -> Example -> Implication -> Conclusion).")
    section_headings: list[str] = Field(description="Draft punchy, editorial subheadings for each major section of the architecture (H2 level).")
    supporting_insights: list[str] = Field(description="Key insights assigned to each logical block.")
    concrete_examples: list[str] = Field(description="Specific, non-abstract examples from the source to illustrate claims.")

from typing import Optional
from supabase_utils import upload_artifact

def generate_draft(outline_path: str, insights_path: str, packet_path: str, brief_path: Optional[str] = None, feedback: Optional[str] = None, stream: bool = False, lang: str = "en"):
    if not os.path.exists(outline_path) or not os.path.exists(insights_path) or not os.path.exists(packet_path):
        print(json.dumps({"status": "failed", "error": "Missing input payloads."}), file=sys.stderr)
        sys.exit(1)

    with open(outline_path, "r", encoding="utf-8") as f:
        outline_bundle = json.load(f)
    with open(insights_path, "r", encoding="utf-8") as f:
        insights_bundle = json.load(f)
    with open(packet_path, "r", encoding="utf-8") as f:
        packet_bundle = json.load(f)

    # Load brief if available
    brief_data = {}
    if brief_path and os.path.exists(brief_path):
        with open(brief_path, "r", encoding="utf-8") as f:
            brief_bundle = json.load(f)
            # Handle both direct models and wrapped { "data": ... } bundles
            brief_data = brief_bundle.get("data", brief_bundle) if isinstance(brief_bundle, dict) else {}

    source_id = outline_bundle.get("source_id") or outline_bundle.get("video_id")
    outline_data = outline_bundle.get("data", {})
    insights_data = insights_bundle.get("data", {})
    transcript_segments = packet_bundle.get("transcript_segments", [])
    transcript_text = "\n\n".join([f"[{c.get('start', 0)}s]: {c.get('text', '')}" for c in transcript_segments])

    if not os.environ.get("OPENAI_API_KEY"):
        title = outline_data.get("title", "Mock Draft")
        content = "# Mock Content\n\nThis is a mocked draft. Provide OPENAI_API_KEY to run the real writer.\n\n## Section 1\nThe backend pipeline and streaming architecture are working correctly."
        
        if stream:
            print(json.dumps({"type": "stream_start", "source_id": source_id, "title": title}), flush=True)
            print(json.dumps({"type": "chunk", "text": content}), flush=True)
            print(json.dumps({"type": "stream_end", "source_id": source_id, "word_count": len(content.split())}), flush=True)

        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "data": {
                "title": title,
                "content": content,
                "word_count": len(content.split()),
            }
        }
        _save_draft(source_id, mock_result)
        if not stream:
            print(json.dumps(mock_result))
        return

    client = OpenAI()

    # Intent-aware dynamic prompt construction
    content_type = brief_data.get("content_type", "blog article")
    audience = brief_data.get("audience", "general reader")
    tone = brief_data.get("tone", "conversational")
    goal = brief_data.get("goal", "explain the source material clearly")
    reading_level = brief_data.get("reading_level", "clear and accessible")
    source_grounding = brief_data.get("source_grounding_mode", "explicit but blended naturally")
    must_include = brief_data.get("must_include", ["Strong central thesis"])
    avoid_patterns = brief_data.get("avoid_patterns", [
        "Generic AI phrasing", 
        "Academic filler",
        "In today's rapidly evolving digital landscape",
        "It is important to note",
        "Furthermore",
        "Moreover",
        "In conclusion"
    ])

    system_prompt = f"""You are the Senior Writer Agent for Distill — a premium editorial thinking engine.
You write like a world-class human author who prioritizes narrative tension, concrete specificity, and original synthesis over generic summarization.

YOUR PIECE MUST EXHIBIT:
1. **Editorial Framing**: Grounded in a clear thesis frame and chosen angle.
2. **Narrative Progression**: A structure that introduces a new idea in every section, avoiding repetitive explanations.
3. **Identifiable Voice**: Adhering strictly to the selected voice persona (Analyst, Storyteller, etc.).

CRITICAL WRITING RULES:
- **SPECIFICITY OVER ABSTRACTION**: Reference real tools, cases, dates, or systems. Instead of "People are carving out identities", write "Someone who once introduced themselves as 'John’s girlfriend' now introduces themselves as 'the one who just started ceramics classes'".
- **NO AI CLICHÉS**: Strictly avoid: "In today's rapidly evolving world", "It is important to note", "As we move forward", "In conclusion", "Dive into", "Tapestry", "Delve", "Harness". These significantly reduce the human-quality score.
- **PERSPECTIVE OVER COMMENTARY**: Provide a point of view. Explain *why* something matters to a builder or founder.
- **Structure & Spacing**: Use standard Markdown headers (# for Title, ## for Sections). **NON-NEGOTIABLE**: Every 2-3 paragraphs MUST be separated by a punchy `## Section Header`. A draft with no subheadings is a failure. Use double newlines (\n\n) between every paragraph and section.
- **NO HTML**: Do NOT use <h1>, <p>, or other HTML tags. Use ONLY standard Markdown.

TARGET AUDIENCE: {audience}
CONTENT TYPE: {content_type}
TONE: {tone}
GOAL: {goal}
MUST INCLUDE:
{chr(10).join([f"   - {item}" for item in must_include])}

CRITICAL: You MUST write your response entirely in the '{lang}' language.
Format strictly in clean, pure Markdown with double newlines between blocks. Only use HTML if explicitly requested (rare)."""

    user_prompt = f"""Structure Blueprint:
{json.dumps(outline_data, indent=2)}

Grounded Insights:
{json.dumps(insights_data, indent=2)}

Source Transcript Excerpts (Use for specific grounding):
{transcript_text}"""

    if feedback:
        user_prompt += f"\n\nPRIORITY EDITORIAL FEEDBACK to address in this revision:\n{feedback}"

    user_prompt += f"\n\nWrite the complete {content_type} now."

    try:
        # Advanced Editorial Reasoning Stage - defined early for both paths
        reasoning_prompt = f"""Before drafting, perform an internal editorial reasoning sequence:
1. **Frame Builder**: Determine the central thesis of the piece. Capture tension or contrast grounded in the Insight Packet.
2. **Angle Selector**: Select the editorial angle (Explainer, Cultural Analysis, Narrative Reflection, Builder Insight, Case Study, Concept Breakdown, or Contrarian Hot-Take).
3. **Voice Persona Selector**: Select the authorial style (Analyst, Storyteller, Builder, Philosopher, Explainer, or Provocateur).
4. **Structure Architect**: Determine the narrative flow (standard Hook-to-Conclusion, or unconventional models like Inverted Pyramid, Tension-Resolution Loop, or The Hero's Technical Journey).
5. **Headlining Strategy**: Brainstorm punchy, non-generic subheadings for every section that avoid labels like "Context" or "Conclusion" in favor of editorial energy (e.g., "The Infinite Scaffolding" instead of "Background").

Generate a strict structural plan based on this reasoning. Ensure subheadings are mandated and present for every transition.
"""

        # PERFORMANCE UPGRADE: Consolidation logic for streaming
        if stream:
            print(json.dumps({"type": "status", "message": "Strategizing editorial angle and drafting..."}), flush=True)
            # In streaming mode, we fold the editorial reasoning into the system prompt for a single high-speed pass
            optimized_system_prompt = system_prompt + "\n\nEDITORIAL REASONING PROTOCOL:\n" + reasoning_prompt
            
            content_chunks = []
            title = outline_data.get("title", "Draft")

            # Signal stream start
            print(json.dumps({"type": "stream_start", "source_id": source_id, "title": title}), flush=True)

            stream_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": optimized_system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                stream=True,
                max_tokens=3000,
            )

            for chunk in stream_response:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    content_chunks.append(delta)
                    print(json.dumps({"type": "chunk", "text": delta}), flush=True)

            full_content = "".join(content_chunks)
            word_count = len(full_content.split())

            bundle = {
                "status": "success",
                "source_id": source_id,
                "content_type": content_type,
                "data": {"title": title, "content": full_content, "word_count": word_count}
            }
            _save_draft(source_id, bundle)
            # Final success signal for frontend state synchronization
            print(json.dumps({"type": "success", "status": "success", "result": bundle["data"]}), flush=True)
            print(json.dumps({"type": "stream_end", "source_id": source_id, "word_count": word_count}), flush=True)
            return

        # BATCH MODE: High-fidelity reasoning + drafting
        plan_completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior editorial thinker and strategist."},
                {"role": "user", "content": user_prompt + "\n\n" + reasoning_prompt}
            ],
            response_format=ContentPlan,
        )
        plan_data = plan_completion.choices[0].message.parsed
        
        # Inject the generated plan into the drafting prompt
        user_prompt += f"\n\nPre-Writing Editorial Plan:\n{json.dumps(plan_data.model_dump(), indent=2)}\n\nPlease follow this internal outline strictly while drafting."

        if stream:
            # Streaming mode — output text chunks for progressive rendering
            content_chunks = []
            title = outline_data.get("title", "Draft")

            # Signal stream start
            print(json.dumps({"type": "stream_start", "source_id": source_id, "title": title}), flush=True)

            stream_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                stream=True,
                max_tokens=3000,
            )

            for chunk in stream_response:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    content_chunks.append(delta)
                    print(json.dumps({"type": "chunk", "text": delta}), flush=True)

            full_content = "".join(content_chunks)
            word_count = len(full_content.split())

            bundle = {
                "status": "success",
                "source_id": source_id,
                "content_type": content_type,
                "data": {"title": title, "content": full_content, "word_count": word_count}
            }
            _save_draft(source_id, bundle)
            print(json.dumps({"type": "stream_end", "source_id": source_id, "word_count": word_count}), flush=True)

        else:
            # Batch mode — structured output with Self-Editing Pass
            initial_completion = client.beta.chat.completions.parse(
                model="gpt-4o",  # Using stronger model for final drafting
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=WrittenDraft,
            )
            v1_draft = initial_completion.choices[0].message.parsed
            
            # --- INTERNAL SELF-EDITING PASS (Optimized with gpt-4o-mini for speed) ---
            critic_prompt = f"""You are a high-level Editor. Evaluate the following draft against these standards:
1. Is the hook engaging and non-generic?
2. Does each section introduce a new insight without repetition?
3. Are there concrete examples instead of vague abstractions?
4. Is the SELECTED VOICE PERSONA consistent?
5. Are there any AI clichés (e.g. "In today's world", "In conclusion")?
6. **FORMATTING CHECK**: Does the draft have clear, punchy `## Subheadings` for every major section? If it's a long block of text, insert subheadings to break it up effectively.

CRITICAL: You MUST write your response entirely in the '{lang}' language.
If there are issues, rewrite the section to be more specific, human, and properly structured with headers. Return the FINAL, polished draft."""

            final_completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini", # Speed upgrade
                messages=[
                    {"role": "system", "content": "You are a master editorial polisher."},
                    {"role": "user", "content": f"ORIGINAL DRAFT:\n\nTitle: {v1_draft.title}\n\nContent: {v1_draft.content}" + "\n\n" + critic_prompt}
                ],
                response_format=WrittenDraft,
            )
            extracted = final_completion.choices[0].message.parsed
            bundle = {
                "status": "success",
                "source_id": source_id,
                "content_type": content_type,
                "data": json.loads(extracted.model_dump_json())
            }
            _save_draft(source_id, bundle)
            print(json.dumps(bundle))

    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)


def _save_draft(source_id: str, bundle: dict):
    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "drafts")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{source_id}_draft.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2)

    # --- CLOUD BRIDGE ---
    # Upload the JSON draft to Supabase Storage
    upload_artifact("drafts", source_id, path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a written draft from outline + insights.")
    parser.add_argument("--outline_input", required=True)
    parser.add_argument("--insights_input", required=True)
    parser.add_argument("--packet_input", required=True)
    parser.add_argument("--brief_input", required=False, help="Intent-Aware Content Brief payload.")
    parser.add_argument("--feedback", required=False, help="Editorial feedback for revision loop.")
    parser.add_argument("--stream", action="store_true", help="Enable streaming output.")
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    generate_draft(
        args.outline_input, 
        args.insights_input, 
        args.packet_input,
        brief_path=args.brief_input,
        feedback=args.feedback, 
        stream=args.stream,
        lang=args.lang
    )
