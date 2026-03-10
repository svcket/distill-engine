"""
Vimeo source adapter.
Handles vimeo.com URLs. Fetches metadata via Vimeo oEmbed (no API key required).
Transcript availability is manual — Vimeo has no public transcript API.
"""

import re
import json
import urllib.request
from .base_adapter import BaseAdapter, NormalizedSource


class VimeoAdapter(BaseAdapter):

    PATTERNS = [
        r"(?:https?://)?(?:www\.)?vimeo\.com/(\d+)",
        r"(?:https?://)?player\.vimeo\.com/video/(\d+)",
    ]

    def detect(self, url: str) -> bool:
        return any(re.search(p, url.strip()) for p in self.PATTERNS)

    def extract_video_id(self, url: str):
        for p in self.PATTERNS:
            m = re.search(p, url.strip())
            if m:
                return m.group(1)
        return None

    def normalize(self, url: str) -> NormalizedSource:
        video_id = self.extract_video_id(url)
        if not video_id:
            raise ValueError(f"Cannot extract Vimeo ID from: {url}")

        clean_url = f"https://vimeo.com/{video_id}"
        source_id = f"vimeo_{video_id}"
        metadata = self._fetch_oembed(clean_url)

        return NormalizedSource(
            source_id=source_id,
            source_type="vimeo",
            title=metadata.get("title", f"Vimeo: {video_id}"),
            creator=metadata.get("author_name", "Unknown"),
            url=clean_url,
            duration_seconds=metadata.get("duration", 0),
            thumbnail=metadata.get("thumbnail_url"),
            transcript_status="manual",  # Vimeo transcripts need manual upload
            source_confidence=0.9,
            raw_metadata=metadata,
        )

    def _fetch_oembed(self, url: str) -> dict:
        """Vimeo oEmbed returns title, author, duration, thumbnail without API key."""
        try:
            oembed_url = f"https://vimeo.com/api/oembed.json?url={urllib.request.quote(url, safe='')}"
            req = urllib.request.Request(oembed_url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return {}
