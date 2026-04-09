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


# ─── Language Detection ─────────────────────────────────────────────────────
# Lightweight heuristic — zero external deps.
# Scores non-English content via function word matches + diacritic character frequency.

_LANG_MARKERS = {
    "it": {
        "words": ["della", "dello", "degli", "nelle", "sulla", "questo",
                  "perché", "come", "solo", "più", "una", "non", "con",
                  "provato", "mondo", "ho", "sono", "siamo", "tutto", "fare"],
        "chars": "àèéìíîòóùú"
    },
    "es": {
        "words": ["los", "las", "del", "con", "para", "una", "que", "más",
                  "como", "pero", "muy", "también", "sobre", "todo", "cuando",
                  "hay", "sus", "por", "sin", "han"],
        "chars": "áéíóúüñ¿¡"
    },
    "fr": {
        "words": ["les", "des", "une", "dans", "avec", "sur", "pour", "est",
                  "pas", "plus", "par", "mais", "tout", "comme", "très",
                  "que", "qui", "aux", "son", "ses"],
        "chars": "àâäéèêëîïôœùûüÿç"
    },
    "de": {
        "words": ["die", "der", "das", "und", "ist", "mit", "von", "nicht",
                  "sich", "eine", "auch", "mehr", "aber", "über", "beim",
                  "haben", "sein", "werden", "kann", "durch"],
        "chars": "äöüÄÖÜß"
    },
    "pt": {
        "words": ["que", "não", "com", "uma", "para", "por", "muito",
                  "como", "mais", "mas", "também", "então", "isso",
                  "ele", "ela", "nos", "seu", "sua"],
        "chars": "ãõáéíóúâêîôûàü"
    },
}

_LANG_NAMES = {
    "it": "Italian",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese"
}


def detect_language(text: str) -> tuple:
    """Return (lang_code, confidence). Returns ('en', 0.0) for English/unknown."""
    if not text:
        return "en", 0.0

    text_lower = text.lower()
    scores = {}

    for lang, markers in _LANG_MARKERS.items():
        score = 0.0

        # Word matches — strongest signal
        words = re.findall(r"\b\w+\b", text_lower)
        if words:
            matched = sum(1 for w in words if w in markers["words"])
            score += (matched / max(len(words), 1)) * 3.0

        # Diacritic character frequency — weaker signal
        char_hits = sum(1 for c in text_lower if c in markers["chars"])
        score += (char_hits / max(len(text_lower), 1)) * 2.0

        scores[lang] = score

    if not scores:
        return "en", 0.0

    best_lang = max(scores, key=lambda k: scores[k])
    best_score = scores[best_lang]

    # Meaningful threshold to avoid false positives on English with borrowed words
    if best_score > 0.08:
        return best_lang, min(best_score, 1.0)

    return "en", 0.0


# ─── Source Discovery ────────────────────────────────────────────────────────

def find_source(source_id: str) -> dict:
    base = os.path.dirname(__file__)
    source_dir = os.path.join(base, ".tmp", "sources")
    if not os.path.exists(source_dir):
        return {}

    # 1. Direct match
    direct = os.path.join(source_dir, f"{source_id}.json")
    if os.path.exists(direct):
        try:
            with open(direct, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data[0] if isinstance(data, list) and data else data
        except Exception:
            pass

    # 2. Glob through all sources
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


# ─── Ingest Entrypoint ───────────────────────────────────────────────────────

def ingest_source(source_id: str):
    metadata = find_source(source_id)

    if not metadata:
        print(json.dumps({
            "status": "error",
            "error_detail": f"Metadata for '{source_id}' not found. Run ingest adapter first.",
        }), file=sys.stderr)
        sys.exit(1)

    # ENRICHMENT: If this is a shell, run full normalization now
    if metadata.get("is_shell") or metadata.get("source_confidence", 1.0) < 0.6:
        try:
            from adapters.adapter_router import route_source, ADAPTERS
            url = metadata.get("url")
            if url:
                enriched = route_source(url, shell=False)
                metadata.update(enriched.to_legacy_dict())

                # Persist enriched metadata so future stages benefit
                base = os.path.dirname(__file__)
                adapter = next(a for a in ADAPTERS if a.detect(url))
                adapter.save(enriched, base)
        except Exception:
            # Non-fatal — proceed with shell metadata
            pass

    # ─── Language Detection ──────────────────────────────────────────────────
    title = metadata.get("title", "")
    description = metadata.get("description", "")
    probe_text = f"{title} {description[:300]}"
    detected_lang, lang_confidence = detect_language(probe_text)

    language_warning = None
    if detected_lang != "en" and lang_confidence > 0.08:
        lang_name = _LANG_NAMES.get(detected_lang, detected_lang.upper())
        language_warning = (
            f"This content appears to be in {lang_name}. "
            f"Distill is optimised for English-language sources. "
            f"Output quality may be reduced."
        )
        print(
            f"[ingest] Language warning: detected {lang_name} "
            f"(confidence={lang_confidence:.2f})",
            file=sys.stderr
        )

    result = {
        "source_id": source_id,
        "source_type": metadata.get("source_type", "youtube"),
        "status": "success",
        "rationale": "Source metadata enriched. Ready for pipeline execution.",
        "title": metadata.get("title"),
        "channel": metadata.get("channel") or metadata.get("creator"),
        "duration_seconds": metadata.get("duration_seconds", 0),
        "detected_language": detected_lang,
        "language_warning": language_warning,
    }

    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "judgments")
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, f"{source_id}_judgment.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    # Cloud Bridge
    try:
        from supabase_utils import upload_artifact
        upload_artifact("judgments", source_id, json_path)
    except Exception as e:
        print(f"[ingest] Cloud sync skipped: {e}")

    print(json.dumps(result))



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich and prepare source for pipeline.")
    parser.add_argument("--source-id", "--video-id", dest="source_id", required=True)
    args = parser.parse_args()
    ingest_source(args.source_id)
