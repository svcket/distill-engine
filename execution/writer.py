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


def generate_draft(outline_path: str, insights_path: str, packet_path: str, feedback: str = None, stream: bool = False):
    if not os.path.exists(outline_path) or not os.path.exists(insights_path) or not os.path.exists(packet_path):
        print(json.dumps({"status": "failed", "error": "Missing input payloads."}), file=sys.stderr)
        sys.exit(1)

    with open(outline_path, "r", encoding="utf-8") as f:
        outline_bundle = json.load(f)
    with open(insights_path, "r", encoding="utf-8") as f:
        insights_bundle = json.load(f)
    with open(packet_path, "r", encoding="utf-8") as f:
        packet_bundle = json.load(f)

    source_id = outline_bundle.get("source_id") or outline_bundle.get("video_id")
    outline_data = outline_bundle.get("data", {})
    insights_data = insights_bundle.get("data", {})
    transcript_segments = packet_bundle.get("transcript_segments", [])
    transcript_text = "\n\n".join([f"[{c.get('start', 0)}s]: {c.get('text', '')}" for c in transcript_segments])

    if not os.environ.get("OPENAI_API_KEY"):
        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "video_id": source_id,
            "data": {
                "title": outline_data.get("title", "Mock Draft"),
                "content": "# Mock Content\n\nThis is a mocked draft. Provide OPENAI_API_KEY to run the real writer.\n\n## Section 1\nThe backend pipeline and streaming architecture are working correctly.",
                "word_count": 30,
            }
        }
        _save_draft(source_id, mock_result)
        print(json.dumps(mock_result))
        return

    client = OpenAI()

    system_prompt = """You are the Senior Writer Agent for Distill — a premium editorial engine.
You receive a structural blueprint, grounded insights, and direct transcript excerpts extracted from an original source.
Write in a premium, high-signal, practitioner-grade tone. No filler. No fluff.

CRITICAL RULES:
1. Must follow standard blog structure: Compelling hook, context of the source, core thesis, insights/frameworks, implications/applications, conclusion.
2. Must SOUND HUMAN and confident. Use short paragraphs. Avoid academic filler and corporate jargon (e.g., "signifies a pivotal transformation").
3. Must EXPLICITLY reference the source (e.g., "In the talk, the speaker explains...", "One of the most interesting ideas introduced is...").
4. Be specific. Use the exact quotes, themes, and frameworks provided. Do not invent details.
Format strictly in clean Markdown with strong subheadings and bullet points where appropriate."""

    user_prompt = f"""Structure Blueprint:
{json.dumps(outline_data, indent=2)}

Grounded Insights:
{json.dumps(insights_data, indent=2)}

Source Transcript Excerpts (Use for specific grounding):
{transcript_text}"""

    if feedback:
        user_prompt += f"\n\nPRIORITY EDITORIAL FEEDBACK to address in this revision:\n{feedback}"

    user_prompt += "\n\nWrite the complete article now."

    try:
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
                "video_id": source_id,
                "data": {"title": title, "content": full_content, "word_count": word_count}
            }
            _save_draft(source_id, bundle)
            print(json.dumps({"type": "stream_end", "source_id": source_id, "word_count": word_count}), flush=True)

        else:
            # Batch mode — structured output
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=WrittenDraft,
            )
            extracted = completion.choices[0].message.parsed
            bundle = {
                "status": "success",
                "source_id": source_id,
                "video_id": source_id,
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a written draft from outline + insights.")
    parser.add_argument("--outline_input", required=True)
    parser.add_argument("--insights_input", required=True)
    parser.add_argument("--packet_input", required=True)
    parser.add_argument("--feedback", required=False, help="Editorial feedback for revision loop.")
    parser.add_argument("--stream", action="store_true", help="Enable streaming output.")
    args = parser.parse_args()
    generate_draft(args.outline_input, args.insights_input, args.packet_input, feedback=args.feedback, stream=args.stream)
