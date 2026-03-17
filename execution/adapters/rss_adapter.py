import re
import hashlib
import json
from typing import Optional
try:
    from newspaper import Article
except ImportError:
    Article = None


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

        # Try to fetch real title and content
        content_text = ""
        try:
            # 1. NEW: Try Newspaper3k for full article extraction
            if Article:
                article = Article(url)
                article.download()
                article.parse()
                if article.title: title = article.title
                if article.authors: creator = ", ".join(article.authors)
                content_text = article.text
            else:
                # 2. Legacy/Fallback: fetch raw HTML/XML
                import urllib.request
                headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=5) as resp:
                    raw_content = resp.read()
                    content = raw_content.decode("utf-8", errors="replace")
                    
                    if m := re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", content, re.DOTALL | re.IGNORECASE):
                        title = m.group(1).strip()
                    
                    if (not title or "rss feed" in title.lower()) and "</h1>" in content.lower():
                        if h1 := re.search(r"<h1.*?>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</h1>", content, re.DOTALL | re.IGNORECASE):
                            h1_text = re.sub(r"<[^>]+>", "", h1.group(1)).strip()
                            if h1_text: title = h1_text

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
            description=content_text[:500] if content_text else "RSS/Blog text content.",
            transcript_status="pending_text" if content_text or url else "manual",
            language="en",
            thumbnail=None,
            source_confidence=0.8 if Article else 0.5,
            raw_metadata={
                "detected_url": url,
                "extracted_text_preview": content_text[:1000] if content_text else None
            },
        )

