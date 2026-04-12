"""
Source Ingestion — lightweight enrichment engine.
Simply validates the source metadata and persists it for the pipeline.
No longer rejects sources based on "topic" algorithms.
"""

import sys
import argparse
import json
import os
import glob
import re

# Ensure local imports work by adding directory to path immediately
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fs_utils import get_safe_tmp_dir, get_safe_tmp_path
from scavenger_hub import trigger_scavenger_rescue


# ─── Language Detection ─────────────────────────────────────────────────────
_LANG_MARKERS = {
    "it": {"words": ["della", "dello", "degli", "nelle", "sulla", "questo"], "chars": "àèéìíîòóùú"},
    "es": {"words": ["los", "las", "del", "con", "para", "una", "que"], "chars": "áéíóúüñ¿¡"},
    "fr": {"words": ["les", "des", "une", "dans", "avec", "sur", "pour"], "chars": "àâäéèêëîïôœùûüÿç"},
    "de": {"words": ["die", "der", "das", "und", "ist", "mit", "von"], "chars": "äöüÄÖÜß"},
    "pt": {"words": ["que", "não", "com", "uma", "para", "por", "muito"], "chars": "ãõáéíóúâêîôûàü"},
}

_LANG_NAMES = {"it": "Italian", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese"}

def detect_language(text: str) -> tuple:
    if not text: return "en", 0.0
    text_lower = text.lower()
    scores = {}
    for lang, markers in _LANG_MARKERS.items():
        score = 0.0
        words = re.findall(r"\b\w+\b", text_lower)
        if words:
            matched = sum(1 for w in words if w in markers["words"])
            score += (matched / max(len(words), 1)) * 3.0
        char_hits = sum(1 for c in text_lower if c in markers["chars"])
        score += (char_hits / max(len(text_lower), 1)) * 2.0
        scores[lang] = score
    if not scores: return "en", 0.0
    best_lang = max(scores, key=lambda k: scores[k])
    if scores[best_lang] > 0.08: return best_lang, min(scores[best_lang], 1.0)
    return "en", 0.0

# ─── Source Discovery ────────────────────────────────────────────────────────
def find_source(source_id: str) -> dict:
    source_dir = get_safe_tmp_dir("sources")
    if not os.path.exists(source_dir): return {}
    direct = os.path.join(source_dir, f"{source_id}.json")
    if os.path.exists(direct):
        try:
            with open(direct, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data[0] if isinstance(data, list) and data else data
        except: pass
    for file in glob.glob(os.path.join(source_dir, "*.json")):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("video_id") == source_id or item.get("source_id") == source_id:
                    return item
        except: continue
    return {}

# ─── Ingest Entrypoint ───────────────────────────────────────────────────────
def ingest_source(source_id: str, url: str = None):
    metadata = find_source(source_id)

    # BRIDGE: If metadata missing (common in split Vercel/Railway deploys), initialize from URL
    if not metadata and url:
        print(f"[ingest] Metadata not found locally. Initializing from URL: {url}", file=sys.stderr)
        metadata = {
            "source_id": source_id,
            "url": url,
            "is_shell": True,
            "title": f"Source {source_id}"
        }

    if not metadata:
        print(json.dumps({
            "status": "error",
            "error_detail": f"Metadata for '{source_id}' not found and no URL provided.",
        }), file=sys.stderr)
        sys.exit(1)

    # ENRICHMENT
    if metadata.get("is_shell") or metadata.get("source_confidence", 1.0) < 0.6:
        try:
            from adapters.adapter_router import route_source, ADAPTERS
            target_url = metadata.get("url")
            if target_url:
                adapter = next(a for a in ADAPTERS if a.detect(target_url))
                enriched = route_source(target_url, shell=False)
                metadata.update(enriched.to_legacy_dict())
                adapter.save(enriched, get_safe_tmp_dir())
        except Exception as e:
            print(f"[ingest] Enrichment failed: {e}. Attempting Scavenger Rescue...", file=sys.stderr)
            # FINAL DEFENSE: Metadata Scavenger Rescue
            s_type = metadata.get("source_type", "youtube")
            s_url = metadata.get("url")
            if s_url:
                rescue = trigger_scavenger_rescue(s_type, s_url, mode="metadata")
                if rescue:
                    print(f"[ingest] Scavenger Success: Recovered metadata for {s_url}", file=sys.stderr)
                    metadata.update(rescue)

    # Language Detection
    probe_text = f"{metadata.get('title', '')} {metadata.get('description', '')[:300]}"
    detected_lang, lang_confidence = detect_language(probe_text)
    language_warning = None
    if detected_lang != "en" and lang_confidence > 0.08:
        lang_name = _LANG_NAMES.get(detected_lang, detected_lang.upper())
        language_warning = f"Content in {lang_name}. Distill is optimised for English."

    result = {
        "source_id": source_id,
        "source_type": metadata.get("source_type", "youtube"),
        "status": "success",
        "title": metadata.get("title"),
        "channel": metadata.get("channel") or metadata.get("creator"),
        "duration_seconds": metadata.get("duration_seconds", 0),
        "detected_language": detected_lang,
        "language_warning": language_warning,
        "score": 10 # Default pass
    }

    out_dir = get_safe_tmp_dir("judgments")
    json_path = os.path.join(out_dir, f"{source_id}_judgment.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    # Cloud Bridge
    try:
        from supabase_utils import upload_artifact
        upload_artifact("judgments", source_id, json_path)
    except Exception as e:
        print(f"[ingest] Cloud sync skipped: {e}", file=sys.stderr)

    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--url", required=False)
    args = parser.parse_args()
    ingest_source(args.source_id, args.url)
 # Build cache buster: Sun Apr 12 09:21:41 WAT 2026
