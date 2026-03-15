"""
YouTube source adapter.
Wraps existing YouTube API + transcript logic behind the normalized schema.
"""

import os
import re
import json
import hashlib
from typing import Optional

from .base_adapter import BaseAdapter, NormalizedSource


class YouTubeAdapter(BaseAdapter):

    PATTERNS = [
        r"(?:https?://)?(?:www\.)?youtube\.com/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})",
        r"(?:https?://)?youtu\.be/([a-zA-Z0-9_-]{11})",
        r"(?:https?://)?(?:www\.)?youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",  # bare video ID
    ]

    def detect(self, url: str) -> bool:
        return any(re.search(p, url.strip()) for p in self.PATTERNS)

    def extract_video_id(self, url: str) -> Optional[str]:
        for pattern in self.PATTERNS:
            m = re.search(pattern, url.strip())
            if m:
                return m.group(1)
        return None

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        video_id = self.extract_video_id(url)
        if not video_id:
            raise ValueError(f"Cannot extract YouTube video ID from: {url}")

        clean_url = f"https://www.youtube.com/watch?v={video_id}"
        
        # Fast Path: return shell if requested
        if shell:
            return NormalizedSource(
                source_id=video_id,
                source_type="youtube",
                title=f"YouTube Video ({video_id})",
                creator="YouTube",
                url=clean_url,
                transcript_status="unknown",
                source_confidence=0.5, # Lower confidence for shell
                is_shell=True,
            )

        metadata = self._fetch_metadata(video_id)

        return NormalizedSource(
            source_id=video_id,
            source_type="youtube",
            title=metadata.get("title", f"YouTube: {video_id}"),
            creator=metadata.get("channel", "Unknown Channel"),
            url=clean_url,
            published_at=metadata.get("published_at"),
            duration_seconds=metadata.get("duration_seconds", 0),
            description=metadata.get("description", ""),
            transcript_status="available",  # Optimistic; fetch stage will confirm
            language="en",
            thumbnail=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            source_confidence=1.0,
            raw_metadata=metadata,
        )

    def _fetch_metadata(self, video_id: str) -> dict:
        """
        Try to fetch metadata via YouTube Data API v3.
        Falls back to a minimal stub if the API key is missing or call fails.
        """
        api_key = os.environ.get("YOUTUBE_API_KEY") or os.environ.get("NEXT_PUBLIC_YOUTUBE_API_KEY")

        if api_key:
            try:
                import urllib.request
                import urllib.parse

                params = urllib.parse.urlencode({
                    "part": "snippet,contentDetails",
                    "id": video_id,
                    "key": api_key
                })
                req = urllib.request.Request(
                    f"https://www.googleapis.com/youtube/v3/videos?{params}",
                    headers={"Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode())

                if data.get("items"):
                    item = data["items"][0]
                    snippet = item.get("snippet", {})
                    content = item.get("contentDetails", {})

                    # Parse ISO 8601 duration
                    duration_str = content.get("duration", "PT0S")
                    duration_seconds = self._parse_iso_duration(duration_str)

                    return {
                        "title": snippet.get("title", f"YouTube: {video_id}"),
                        "channel": snippet.get("channelTitle", "Unknown"),
                        "published_at": snippet.get("publishedAt"),
                        "duration_seconds": duration_seconds,
                        "description": snippet.get("description", "")[:500],
                        "duration": duration_str,
                    }
            except Exception:
                pass  # Fall through to stub

        # Fallback: Scrape the page for the <title> tag if API is missing or fails
        try:
            import urllib.request
            import re
            req = urllib.request.Request(
                f"https://www.youtube.com/watch?v={video_id}",
                headers={"User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8")
                if m := re.search(r"<title>(.*?)</title>", html, re.IGNORECASE):
                    title = m.group(1).replace(" - YouTube", "").strip()
                    return {
                        "title": title,
                        "channel": "YouTube",
                        "duration_seconds": 0,
                        "description": "",
                    }
        except Exception:
            pass

        # Minimal stub if all else fails
        return {
            "title": f"YouTube Video ({video_id})",
            "channel": "Unknown",
            "duration_seconds": 0,
            "description": "",
        }

    def _parse_iso_duration(self, s: str) -> int:
        h = int(m.group(1)) if (m := re.search(r"(\d+)H", s)) else 0
        mi = int(m.group(1)) if (m := re.search(r"(\d+)M", s)) else 0
        sec = int(m.group(1)) if (m := re.search(r"(\d+)S", s)) else 0
        return h * 3600 + mi * 60 + sec
