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
        r"(?:https?://)?(?:open\.)?spotify\.com/(?:episode|show)/",
        r"(?:https?://)?podcasts\.apple\.com/",
        r"(?:https?://)?(?:www\.)?buzzsprout\.com/",
        r"(?:https?://)?(?:www\.)?anchor\.fm/",
        r"(?:https?://)?(?:www\.)?podbean\.com/",
        r"\.mp3(?:\?|$)",
        r"\.m4a(?:\?|$)",
        r"\.wav(?:\?|$)",
        r"(?:https?://)?feeds\.",   # RSS feed domain
        r"(?:https?://)?anchor\.fm/s/[a-zA-Z0-9]+/podcast/rss", # Specific anchor feeds
        r"(?:https?://)?pcrb\.fm/", # Common redirector
        r"rss\.com/podcasts/",
        r"simplecast\.com/episodes/",
        r"share\.transistor\.fm/s/",
    ]

    def detect(self, url: str) -> bool:
        return any(re.search(p, url.strip(), re.IGNORECASE) for p in self.PATTERNS)

    def normalize(self, url: str) -> NormalizedSource:
        source_id = "podcast_" + hashlib.md5(url.encode()).hexdigest()[:12]
        
        # 1. Skip resolution if URL is already a direct audio file
        if url.lower().endswith(".mp3") or ".mp3?" in url.lower() or url.lower().endswith(".m4a") or ".m4a?" in url.lower():
            feed_url = url
            mp3_url = url
            metadata = {"title": "Direct Audio Source", "description": url}
        else:
            # 2. Resolve to an RSS feed URL if it's Apple or Spotify
            feed_url = self._resolve_to_rss_feed(url)
            
            # 3. Extract metadata and direct MP3 url from the feed
            metadata, mp3_url = self._fetch_rss_metadata(feed_url)

        # If we successfully found an MP3, we override the URL so yt-dlp downloads the raw audio natively
        final_extract_url = mp3_url if mp3_url else url

        # If we couldn't resolve a Spotify/Apple feed to an actual MP3, warn the user
        description = metadata.get("description", "")[:500]
        status = "pending_whisper"
        if "spotify.com" in url and not mp3_url:
            description = "[DRM Warning] Could not resolve a public RSS feed for this Spotify episode. Direct download may fail. Please use an RSS feed or Apple Podcasts link if possible. " + description
            # We still try, as some Spotify links might work with yt-dlp if it's an un-DRM'd hoster
            
        return NormalizedSource(
            source_id=source_id,
            source_type="podcast",
            title=metadata.get("title", "Podcast Episode"),
            creator=metadata.get("author", "Unknown Host"),
            url=final_extract_url,
            published_at=metadata.get("published_at"),
            duration_seconds=metadata.get("duration_seconds", 0),
            description=description,
            transcript_status=status,
            language="en",
            source_confidence=0.85,
            raw_metadata=metadata,
        )

    def _resolve_to_rss_feed(self, url: str) -> str:
        """Resolve Spotify or Apple Podcast URLs into a raw RSS feed URL via iTunes API."""
        import json
        
        # Handle Apple Podcasts
        apple_match = re.search(r"id(\d+)", url)
        if apple_match and "apple.com" in url:
            try:
                req = urllib.request.Request(f"https://itunes.apple.com/lookup?id={apple_match.group(1)}")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode())
                    if data.get("results"):
                        return data["results"][0].get("feedUrl", url)
            except Exception:
                pass

        # Handle Spotify (Scrape title, search iTunes)
        if "spotify.com" in url:
            try:
                # Use a more realistic User-Agent to avoid blocks
                req = urllib.request.Request(url, headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                })
                with urllib.request.urlopen(req, timeout=5) as resp:
                    html = resp.read().decode("utf-8", errors="ignore")
                
                # Spotify puts metadata in several places. Title is usually "Episode Name | Podcast on Spotify" or similar.
                title_match = re.search(r"<title>(.*?)</title>", html)
                if title_match:
                    raw_title = title_match.group(1)
                    # Often "Episode Name - Show Name | Podcast on Spotify"
                    clean_title = raw_title.split("|")[0].strip()
                    parts = clean_title.split(" - ")
                    show_name = parts[-1].strip() if len(parts) > 1 else clean_title
                    episode_name = parts[0].strip() if len(parts) > 1 else ""

                    # Try searching for exact show name first
                    search_queries = [show_name]
                    if episode_name: 
                        search_queries.insert(0, f"{show_name} {episode_name}")
                    
                    for query in search_queries:
                        search_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=podcast"
                        req2 = urllib.request.Request(search_url)
                        with urllib.request.urlopen(req2, timeout=5) as resp2:
                            data = json.loads(resp2.read().decode())
                            if data.get("results"):
                                return data["results"][0].get("feedUrl", url)
            except Exception:
                pass

        # Handle RSS.com
        if "rss.com/podcasts/" in url:
            match = re.search(r"rss\.com/podcasts/([^/]+)", url)
            if match:
                return f"https://media.rss.com/{match.group(1)}/feed.xml"

        # Handle Simplecast
        if "simplecast.com/episodes/" in url:
            # Simplecast often has the feed at [show].simplecast.com/rss
            match = re.search(r"([^.]+)\.simplecast\.com/episodes/", url)
            if match:
                return f"https://feeds.simplecast.com/{match.group(1)}"
                
        return url

    def _fetch_rss_metadata(self, url: str) -> tuple[dict, Optional[str]]:
        """
        Parse RSS/Atom feed to find the latest <item> metadata and <enclosure> MP3 URL.
        """
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Distill/1.0 (podcast metadata fetcher)",
                "Accept": "application/rss+xml, application/xml, text/xml, */*"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read().decode("utf-8", errors="replace")

            # Isolate the first <item> block so we only get the latest episode
            item_match = re.search(r"<item>(.*?)</item>", content, re.DOTALL | re.IGNORECASE)
            if not item_match:
                return {}, None
                
            item_xml = item_match.group(1)

            title_m = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item_xml, re.DOTALL | re.IGNORECASE)
            author_m = re.search(r"<itunes:author>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</itunes:author>", item_xml, re.DOTALL | re.IGNORECASE)
            desc_m = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", item_xml, re.DOTALL | re.IGNORECASE)
            dur_m = re.search(r"<itunes:duration>(.*?)</itunes:duration>", item_xml, re.IGNORECASE)
            
            # Extract the raw MP3 enclosure
            enclosure_m = re.search(r"<enclosure[^>]+url=[\"']([^\"']+)[\"']", item_xml, re.IGNORECASE)
            mp3_url = enclosure_m.group(1) if enclosure_m else None

            duration_seconds = 0
            if dur_m:
                parts = dur_m.group(1).strip().split(":")
                if len(parts) == 3:
                    duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration_seconds = int(parts[0]) * 60 + int(parts[1])

            metadata = {
                "title": title_m.group(1).strip() if title_m else "Podcast Episode",
                "author": author_m.group(1).strip() if author_m else "Unknown Host",
                "description": desc_m.group(1).strip()[:500] if desc_m else "",
                "duration_seconds": duration_seconds,
            }
            return metadata, mp3_url
        except Exception:
            return {}, None
