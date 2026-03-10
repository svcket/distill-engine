"""
Podcast source adapter.
Handles podcast episode URLs (RSS feeds, Spotify, Apple Podcasts, direct MP3 URLs).
Extracts metadata from RSS feed when available.
Transcript via Whisper API if an audio file is accessible.
"""

import re
import hashlib
import urllib.request
import urllib.parse
from typing import Optional
from .base_adapter import BaseAdapter, NormalizedSource


class PodcastAdapter(BaseAdapter):

    # URL patterns for known podcast platforms + RSS + raw audio
    PATTERNS = [
        r"(?:https?://)?(?:open\.)?spotify\.com/episode/",
        r"(?:https?://)?podcasts\.apple\.com/",
        r"(?:https?://)?(?:www\.)?buzzsprout\.com/",
        r"(?:https?://)?(?:www\.)?anchor\.fm/",
        r"(?:https?://)?(?:www\.)?podbean\.com/",
        r"\.mp3(?:\?|$)",
        r"\.m4a(?:\?|$)",
        r"/feed/",          # RSS feed URL
        r"/rss(?:\?|$|/)",
    ]

    def detect(self, url: str) -> bool:
        return any(re.search(p, url.strip(), re.IGNORECASE) for p in self.PATTERNS)

    def normalize(self, url: str) -> NormalizedSource:
        source_id = "podcast_" + hashlib.md5(url.encode()).hexdigest()[:12]
        metadata = self._fetch_rss_metadata(url)

        return NormalizedSource(
            source_id=source_id,
            source_type="podcast",
            title=metadata.get("title", "Podcast Episode"),
            creator=metadata.get("author", "Unknown Host"),
            url=url,
            published_at=metadata.get("published_at"),
            duration_seconds=metadata.get("duration_seconds", 0),
            description=metadata.get("description", "")[:500],
            transcript_status="pending_whisper",  # Needs Whisper transcription
            language="en",
            source_confidence=0.85,
            raw_metadata=metadata,
        )

    def _fetch_rss_metadata(self, url: str) -> dict:
        """
        Try to parse RSS/Atom feed for episode metadata.
        Falls back to URL-derived stub.
        """
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Distill/1.0 (podcast metadata fetcher)",
                "Accept": "application/rss+xml, application/xml, text/xml, */*"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read().decode("utf-8", errors="replace")

            # Basic XML extraction without external deps
            title_m = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", content, re.DOTALL)
            author_m = re.search(r"<itunes:author>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</itunes:author>", content, re.DOTALL)
            desc_m = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", content, re.DOTALL)
            dur_m = re.search(r"<itunes:duration>(.*?)</itunes:duration>", content)

            duration_seconds = 0
            if dur_m:
                parts = dur_m.group(1).strip().split(":")
                if len(parts) == 3:
                    duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration_seconds = int(parts[0]) * 60 + int(parts[1])

            return {
                "title": title_m.group(1).strip() if title_m else "Podcast Episode",
                "author": author_m.group(1).strip() if author_m else "Unknown Host",
                "description": desc_m.group(1).strip()[:500] if desc_m else "",
                "duration_seconds": duration_seconds,
            }
        except Exception:
            return {}
