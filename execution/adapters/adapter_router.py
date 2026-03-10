"""
Adapter router — detects source type and routes to the correct adapter.
This is the single entry point for all source ingestion.

Usage:
    from adapters.adapter_router import route_source
    source = route_source("https://www.youtube.com/watch?v=abc123")
    print(source.source_type)  # "youtube"
    print(source.source_id)    # "abc123"
"""

import sys
import os
import json
import argparse

# Allow running as a standalone script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters.base_adapter import NormalizedSource
from adapters.youtube_adapter import YouTubeAdapter
from adapters.vimeo_adapter import VimeoAdapter
from adapters.podcast_adapter import PodcastAdapter
from adapters.upload_adapter import UploadAdapter


# Registry — order matters; more specific patterns first
ADAPTERS = [
    YouTubeAdapter(),
    VimeoAdapter(),
    PodcastAdapter(),
    UploadAdapter(),
]


def route_source(url: str) -> NormalizedSource:
    """
    Detect source type and normalize via the appropriate adapter.
    Raises ValueError if no adapter matches.
    """
    url = url.strip()

    for adapter in ADAPTERS:
        if adapter.detect(url):
            return adapter.normalize(url)

    raise ValueError(
        f"No adapter found for source: {url}\n"
        f"Supported types: YouTube, Vimeo, Podcast/RSS, uploaded audio/video files."
    )


def ingest(url: str, base_dir: str) -> dict:
    """
    Full ingest: normalize the source, save it to disk, and return the saved path.
    This is the main function called by the API route.
    """
    source = route_source(url)
    adapter = next(a for a in ADAPTERS if a.detect(url))
    saved_path = adapter.save(source, base_dir)

    return {
        "status": "success",
        "source_id": source.source_id,
        "source_type": source.source_type,
        "title": source.title,
        "creator": source.creator,
        "url": source.url,
        "duration_seconds": source.duration_seconds,
        "transcript_status": source.transcript_status,
        "saved_path": saved_path,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Route and normalize a source URL.")
    parser.add_argument("--url", required=True, help="Source URL to ingest.")
    parser.add_argument("--base-dir", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        help="Base directory for .tmp file storage.")
    args = parser.parse_args()

    try:
        result = ingest(args.url, args.base_dir)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)
