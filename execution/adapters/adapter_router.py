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
from adapters.rss_adapter import RssAdapter
from adapters.recording_adapter import RecordingAdapter


# Registry — order matters; more specific platforms first
ADAPTERS = [
    PodcastAdapter(),
    YouTubeAdapter(),
    VimeoAdapter(),
    UploadAdapter(),
    RecordingAdapter(),
    RssAdapter(), # Generic fallback
]


def route_source(url: str, shell: bool = False) -> NormalizedSource:
    """
    Detect source type and normalize via the appropriate adapter.
    Raises ValueError if no adapter matches.
    """
    url = url.strip()

    # Try specific adapters first
    for adapter in ADAPTERS[:-1]:
        if adapter.detect(url):
            return adapter.normalize(url, shell=shell)

    # Fallback to RSS/Generic Web if it looks like a URL
    if url.startswith("http") and ADAPTERS[-1].detect(url):
        return ADAPTERS[-1].normalize(url, shell=shell)

    raise ValueError(
        f"No adapter found for source: {url}\n"
        f"Supported types: YouTube, Vimeo, Podcast/RSS, uploaded audio/video files."
    )


def ingest(url: str, base_dir: str, shell: bool = False) -> dict:
    """
    Full ingest: normalize the source, save it to disk, and return the saved path.
    This is the main function called by the API route.
    """
    source = route_source(url, shell=shell)
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
        "is_shell": shell,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Route and normalize a source URL.")
    parser.add_argument("--url", required=True, help="Source URL to ingest.")
    parser.add_argument("--source-type", dest="source_type", help="Optional source type hint")
    parser.add_argument("--base-dir", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        help="Base directory for .tmp file storage.")
    parser.add_argument("--shell", action="store_true", help="Return immediate shell source without full metadata.")
    args = parser.parse_args()

    try:
        result = ingest(args.url, args.base_dir, shell=args.shell)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "error_detail": str(e)}), file=sys.stderr)
        sys.exit(1)
