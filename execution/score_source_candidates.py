"""
Source Judge — quality-based scoring engine.
Scores any source type based on content quality signals.
Topics are soft preference weights, NOT hard filters.
Works across any knowledge domain.
"""

import sys
import argparse
import json
import os
import glob
import re


# ── Soft preference weights (additive bonuses, not gates) ────────────────────
PREFERRED_CHANNELS = [
    "ycombinator", "lex fridman", "andrej karpathy", "huberman lab",
    "stanford", "mit", "vercel", "a16z", "sequoia", "paul graham",
    "daniel gross", "nat friedman", "gwern", "3blue1brown",
]

TOPIC_PREFERENCES = [
    "ai", "llm", "design", "architecture", "system", "react", "nextjs",
    "agent", "engineering", "product", "startup", "founder", "research",
    "cognitive", "learning", "mental model", "framework", "infrastructure",
    "distribution", "compounding", "leverage", "clarity", "strategy",
]

CLICKBAIT_SIGNALS = [
    "shocking", "you won't believe", "insane", "secret", "never do this",
    "destroyed", "gone wrong", "exposing", "disturbing", "clickbait",
    "viral", "drama", "beef", "cancelled", "exposed",
]

SHALLOW_SIGNALS = [
    "top 10", "top 5", "best of", "ranking", "tier list", "react to",
    "meme review", "vlog", "daily vlog", "morning routine",
]


def parse_duration_to_seconds(s: str) -> int:
    """Parse ISO 8601 duration (e.g. PT1H20M5S) or raw seconds int."""
    if not s:
        return 0
    if isinstance(s, (int, float)):
        return int(s)
    if str(s).isdigit():
        return int(s)
    h = int(m.group(1)) if (m := re.search(r"(\d+)H", str(s))) else 0
    mi = int(m.group(1)) if (m := re.search(r"(\d+)M", str(s))) else 0
    sec = int(m.group(1)) if (m := re.search(r"(\d+)S", str(s))) else 0
    return h * 3600 + mi * 60 + sec


def find_source(source_id: str) -> dict:
    """Look up source metadata from .tmp/sources/ by source_id or video_id."""
    base = os.path.dirname(__file__)
    source_dir = os.path.join(base, ".tmp", "sources")
    if not os.path.exists(source_dir):
        return {}

    # First try exact file match {source_id}.json
    direct = os.path.join(source_dir, f"{source_id}.json")
    if os.path.exists(direct):
        try:
            with open(direct, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and data:
                    return data[0]
                return data
        except Exception:
            pass

    # Scan all files for matching video_id or source_id
    for file in glob.glob(os.path.join(source_dir, "*.json")):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("video_id") == source_id or item.get("source_id") == source_id:
                    return item
        except Exception:
            continue
    return {}


def score_source(source_id: str):
    metadata = find_source(source_id)

    if not metadata:
        # Last resort: create a minimal stub so the scorer still returns something
        print(json.dumps({
            "status": "error",
            "error_detail": f"Metadata for '{source_id}' not found. Run ingest first.",
        }), file=sys.stderr)
        sys.exit(1)

    title = (metadata.get("title") or "").lower()
    creator = (metadata.get("channel") or metadata.get("creator") or "").lower()
    description = (metadata.get("description") or "").lower()
    source_type = metadata.get("source_type", "youtube")
    duration_raw = metadata.get("duration") or metadata.get("duration_seconds") or 0
    transcript_status = metadata.get("transcript_status", "unknown")

    seconds = parse_duration_to_seconds(duration_raw)

    score = 5.0  # Neutral baseline
    rationale = []

    # ── 1. Duration fitness ──────────────────────────────────────────
    if seconds > 0:
        if seconds < 180:
            score -= 2.5
            rationale.append("Too short (under 3 min) to contain meaningful depth.")
        elif seconds < 600:
            score -= 1.0
            rationale.append("Short format (3–10 min) — limited conceptual density expected.")
        elif seconds >= 1800:
            score += 1.5
            rationale.append("Long-form format (30+ min) rewards deep exploration.")
        elif seconds >= 1200:
            score += 1.0
            rationale.append("Medium-depth format (20–30 min).")

    # ── 2. Clickbait & shallow content penalty ───────────────────────
    for term in CLICKBAIT_SIGNALS:
        if term in title or term in description:
            score -= 2.5
            rationale.append(f"Clickbait signal detected: "{term}".")
            break  # One penalty per category

    for term in SHALLOW_SIGNALS:
        if term in title:
            score -= 1.5
            rationale.append(f"Shallow format signal: "{term}".")
            break

    # ── 3. Creator credibility bonus ─────────────────────────────────
    for channel in PREFERRED_CHANNELS:
        if channel in creator:
            score += 2.5
            rationale.append(f"High-credibility creator: {metadata.get('channel', creator)}.")
            break

    # ── 4. Transcript availability ───────────────────────────────────
    if transcript_status == "available":
        score += 0.5
        rationale.append("Transcript confirmed available.")
    elif transcript_status in ("unavailable", "manual"):
        score -= 0.5
        rationale.append("No auto-transcript — manual processing required.")

    # ── 5. Topic preference (soft weight, max +2.0) ──────────────────
    text_corpus = f"{title} {description}"
    topic_hits = [t for t in TOPIC_PREFERENCES if t in text_corpus]
    if topic_hits:
        topic_bonus = min(len(topic_hits) * 0.4, 2.0)
        score += topic_bonus
        top_topics = ", ".join(topic_hits[:3])
        rationale.append(f"Aligns with preferred topics: {top_topics}.")

    # ── 6. Description depth bonus ───────────────────────────────────
    desc_words = len(description.split())
    if desc_words > 200:
        score += 0.5
        rationale.append("Detailed description signals thoughtful content.")
    elif desc_words < 20 and description:
        score -= 0.3
        rationale.append("Sparse description — limited context available.")

    # ── 7. Source type bias adjustments ─────────────────────────────
    if source_type == "podcast":
        score += 0.5  # Podcasts trend toward depth
        rationale.append("Podcast format tends toward long-form discussion.")
    elif source_type == "upload":
        score += 0.3  # User explicitly chose this — signals intent
        rationale.append("User-uploaded source — high intent signal.")

    # ── Final clamping ───────────────────────────────────────────────
    score = round(max(1.0, min(10.0, score)), 1)

    if score >= 7.5:
        decision = "Approved"
    elif score >= 5.0:
        decision = "Deferred"
    else:
        decision = "Rejected"

    rationale_text = " ".join(rationale) if rationale else "Standard evaluation — no strong signals detected."

    result = {
        "source_id": source_id,
        "video_id": source_id,  # backwards compat
        "source_type": source_type,
        "status": "success",
        "score": score,
        "decision": decision,
        "rationale": rationale_text,
        "title": metadata.get("title"),
        "channel": metadata.get("channel") or metadata.get("creator"),
        "duration_seconds": seconds,
    }

    # Persist judgment
    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "judgments")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{source_id}_judgment.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score any source based on quality signals.")
    parser.add_argument("--source-id", "--video-id", dest="source_id", required=True,
                        help="Source ID (or legacy YouTube video ID).")
    args = parser.parse_args()
    score_source(args.source_id)
