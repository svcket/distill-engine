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

def find_source(source_id: str) -> dict:
    base = os.path.dirname(__file__)
    source_dir = os.path.join(base, ".tmp", "sources")
    if not os.path.exists(source_dir):
        return {}

    direct = os.path.join(source_dir, f"{source_id}.json")
    if os.path.exists(direct):
        try:
            with open(direct, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data[0] if isinstance(data, list) and data else data
        except Exception:
            pass

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

def ingest_source(source_id: str):
    metadata = find_source(source_id)

    if not metadata:
        print(json.dumps({
            "status": "error",
            "error_detail": f"Metadata for '{source_id}' not found. Run ingest adapter first.",
        }), file=sys.stderr)
        sys.exit(1)

    result = {
        "source_id": source_id,
        "video_id": source_id,
        "source_type": metadata.get("source_type", "youtube"),
        "status": "success",
        "rationale": "Source metadata enriched. Ready for pipeline execution.",
        "title": metadata.get("title"),
        "channel": metadata.get("channel") or metadata.get("creator"),
        "duration_seconds": metadata.get("duration_seconds", 0),
    }

    out_dir = os.path.join(os.path.dirname(__file__), ".tmp", "judgments")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{source_id}_judgment.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich and prepare source for pipeline.")
    parser.add_argument("--source-id", "--video-id", dest="source_id", required=True)
    args = parser.parse_args()
    ingest_source(args.source_id)
