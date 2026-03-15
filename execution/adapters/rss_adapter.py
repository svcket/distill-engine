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
        clean_url = url.strip().lower()
        # Direct matches for RSS/Feeds
        if any(re.search(p, clean_url) for p in self.PATTERNS):
            return True
        # Catch-all for any web URL
        return clean_url.startswith("http")

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        url = url.strip()
        source_id = "rss_" + hashlib.md5(url.encode()).hexdigest()[:12]

        title = f"RSS Feed: {url}"
        creator = "Unknown Author"
        
        # Fast Path: return shell if requested
        if shell:
            return NormalizedSource(
                source_id=source_id,
                source_type="rss",
                title=title,
                creator=creator,
                url=url,
                transcript_status="manual",
                source_confidence=0.5,
                is_shell=True,
            )

        # Try to fetch real title
        try:
            import urllib.request
            # Use a more modern User-Agent to avoid blocks
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw_content = resp.read()
                # Try to detect encoding from headers or meta
                content = raw_content.decode("utf-8", errors="replace")
                
                # 1. Try <title>
                if m := re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", content, re.DOTALL | re.IGNORECASE):
                    title = m.group(1).strip()
                
                # 2. Fallback to first <h1> if title is missing or suspiciously generic/empty
                if (not title or "rss feed" in title.lower() or "http" in title.lower()) and "</h1>" in content.lower():
                    if h1 := re.search(r"<h1.*?>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</h1>", content, re.DOTALL | re.IGNORECASE):
                        # Clean up any nested tags in H1
                        h1_text = re.sub(r"<[^>]+>", "", h1.group(1)).strip()
                        if h1_text: title = h1_text

                # 3. Fallback to og:title
                if not title or "rss feed" in title.lower():
                    if og := re.search(r'<meta property="og:title" content="(.*?)"', content, re.IGNORECASE):
                        title = og.group(1).strip()

        except Exception:
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
