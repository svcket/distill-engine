"""
RSS source adapter.
Stub implementation for ingesting RSS feeds, blog posts, and text-based articles.
"""

import re
import hashlib
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedSource


class RssAdapter(BaseAdapter):

    # Very naive regex for detection. In production, we'd detect via content-type or specific feed parsing.
    PATTERNS = [
        r"(?:https?://)?(?:www\.)?.*\.rss(?:\?|$)",
        r"(?:https?://)?(?:www\.)?.*\.xml(?:\?|$)",
        r"(?:https?://)?(?:www\.)?.*/feed(?:s)?/?(?:\?|$)",
        r"(?:https?://)?(?:www\.)?.*/rss/?(?:\?|$)",
        r"(?:https?://)?medium\.com/",
        r"(?:https?://)?substack\.com/",
        r"(?:https?://)?ghost\.org/",
    ]

    def detect(self, url: str) -> bool:
        return any(re.search(p, url.strip().lower()) for p in self.PATTERNS)

    def normalize(self, url: str) -> NormalizedSource:
        url = url.strip()
        source_id = "rss_" + hashlib.md5(url.encode()).hexdigest()[:12]

        title = f"RSS Feed: {url}"
        creator = "Unknown Author"
        
        # Try to fetch real title
        try:
            import urllib.request
            req = urllib.request.Request(url, headers={"User-Agent": "Distill/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                content = resp.read().decode("utf-8", errors="replace")
                if m := re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", content, re.IGNORECASE):
                    title = m.group(1).strip()
        except:
            pass

        return NormalizedSource(
            source_id=source_id,
            source_type="rss",
            title=title,
            creator=creator,
            url=url,
            published_at=None,
            duration_seconds=0,
            description="RSS/Blog text content.",
            transcript_status="manual",
            language="en",
            thumbnail=None,
            source_confidence=0.5,
            raw_metadata={"detected_url": url},
        )
