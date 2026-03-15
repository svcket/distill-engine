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

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        source_id = "podcast_" + hashlib.md5(url.encode()).hexdigest()[:12]
        
        # Fast Path: return shell if requested
        if shell:
            return NormalizedSource(
                source_id=source_id,
                source_type="podcast",
                title="Podcast Episode (Pending...)",
                creator="Podcast",
                url=url,
                transcript_status="unknown",
                source_confidence=0.5,
                is_shell=True,
            )

        # 1. Skip resolution if URL is already a direct audio file
        if url.lower().endswith(".mp3") or ".mp3?" in url.lower() or url.lower().endswith(".m4a") or ".m4a?" in url.lower():
            feed_url = url
            mp3_url = url
            metadata = {"title": "Direct Audio Source", "description": url}
        else:
            # 2. Resolve to an RSS feed URL and try to get a target title/guid
            feed_url, target_title, target_guid = self._resolve_to_rss_feed_and_title(url)
            
            # 3. Extract metadata and direct MP3 url from the feed
            metadata, mp3_url = self._fetch_rss_metadata(feed_url, target_title, target_guid)

        # If we successfully found an MP3, we override the URL so yt-dlp downloads the raw audio natively
        final_extract_url = mp3_url if mp3_url else url

        # If we couldn't resolve a Spotify/Apple feed to an actual MP3, warn the user
        description = metadata.get("description", "")[:500]
        status = "pending_whisper"
        strategy = "audio_fallback"
        
        if "spotify.com" in url and not mp3_url:
            description = "[Transcript Unavailable] Could not resolve a public RSS feed for this Spotify episode. Direct download is not supported. " + description
            status = "unavailable"
            strategy = "unavailable"
            
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
            transcript_strategy=strategy,
            transcript_source="audio_whisper" if mp3_url else "unknown",
            language="en",
            source_confidence=0.85,
            raw_metadata=metadata,
        )

    def _resolve_to_rss_feed_and_title(self, url: str) -> tuple[str, Optional[str], Optional[str]]:
        """
        Resolve Spotify or Apple Podcast URLs into (feed_url, target_title, target_guid).
        """
        import json
        
        target_title = None
        target_guid = None

        # Handle Apple Podcasts (Show ID + Episode ID)
        apple_match = re.search(r"id(\d+)", url)
        if apple_match and "apple.com" in url:
            # Extract episode guid from ?i= or similar
            i_match = re.search(r"[?&]i=(\d+)", url)
            if i_match:
                target_guid = i_match.group(1)

            try:
                # Try to get episode title from the page
                req_page = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"})
                with urllib.request.urlopen(req_page, timeout=5) as resp:
                    html = resp.read().decode("utf-8", errors="ignore")
                    og_title = re.search(r'<meta property="og:title" content="(.*?)"', html)
                    if og_title:
                        target_title = og_title.group(1).split(" on Apple Podcasts")[0].strip()
                    else:
                        title_m = re.search(r"<title>(.*?)</title>", html)
                        if title_m:
                            target_title = title_m.group(1).split(" on Apple Podcasts")[0].strip()

                # Extract Apple ID (could be in the path like /show-name/id12345 or /episode/name/id12345)
                # Look for the last 'id' followed by digits
                id_match = re.search(r"id(\d+)(?:\?|$|/)", url)
                if id_match:
                    lookup_id = id_match.group(1)
                    req = urllib.request.Request(f"https://itunes.apple.com/lookup?id={lookup_id}")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode())
                        if data.get("results"):
                            return data["results"][0].get("feedUrl", url), target_title, target_guid
            except Exception:
                pass

        # Handle Spotify (Scrape title, search iTunes)
        if "spotify.com" in url:
            try:
                # 1. Try different User-Agents
                user_agents = [
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                ]
                
                html = ""
                for ua in user_agents:
                    try:
                        req = urllib.request.Request(url, headers={"User-Agent": ua})
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            html = resp.read().decode("utf-8", errors="ignore")
                            if "og:title" in html: break
                    except Exception: continue
                
                # 2. Try Embed URL if main URL failed
                if "og:title" not in html:
                    try:
                        embed_url = url.replace("open.spotify.com/episode/", "open.spotify.com/embed/episode/")
                        req = urllib.request.Request(embed_url, headers={"User-Agent": user_agents[0]})
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            html = resp.read().decode("utf-8", errors="ignore")
                    except Exception: pass
                
                og_title = re.search(r'<meta property="og:title" content="(.*?)"', html)
                if not og_title:
                    # Fallback to <title> or other meta tags
                    og_title = re.search(r'<title>(.*?)</title>', html)

                if og_title:
                    raw_title = og_title.group(1)
                    clean_title = raw_title.split("|")[0].strip()
                    
                    # Remove "Episode [Number]" prefixes or similar
                    clean_title = re.sub(r"^(?:Episode|Ep)\s*\d+[:\s-]*", "", clean_title, flags=re.IGNORECASE).strip()
                    target_title = clean_title
                    
                    parts = clean_title.split(" - ")
                    show_name = parts[-1].strip() if len(parts) > 1 else clean_title
                    episode_name = parts[0].strip() if len(parts) > 1 else ""
                    
                    # Clean the episode name specifically for better searching
                    clean_episode = re.sub(r"Season\s*\d+", "", episode_name, flags=re.IGNORECASE).strip()

                    # Also try to find the creator/show name directly in meta
                    show_m = re.search(r'property="music:musician" content="(.*?)"', html)
                    if not show_m:
                        show_m = re.search(r'property="og:description" content="(.*?)"', html)
                    
                    search_queries = [clean_title]
                    if clean_episode and len(clean_episode) > 5:
                        search_queries.append(clean_episode)
                    if show_m:
                        search_queries.append(show_m.group(1).split(" · ")[0])
                    if len(parts) > 1:
                        search_queries.append(show_name)
                    
                    for query in search_queries:
                        search_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=podcast"
                        req2 = urllib.request.Request(search_url)
                        try:
                            with urllib.request.urlopen(req2, timeout=5) as resp2:
                                data = json.loads(resp2.read().decode())
                                if data.get("results"):
                                    return data["results"][0].get("feedUrl", url), target_title, target_guid
                        except Exception: continue
            except Exception:
                pass

        # Handle RSS.com and Simplecast as before
        if "rss.com/podcasts/" in url:
            match = re.search(r"rss\.com/podcasts/([^/]+)", url)
            if match: return f"https://media.rss.com/{match.group(1)}/feed.xml", None, None

        if "simplecast.com/episodes/" in url:
            match = re.search(r"([^.]+)\.simplecast\.com/episodes/", url)
            if match: return f"https://feeds.simplecast.com/{match.group(1)}", None, None
                
        # Generic Fallback: If we couldn't resolve via iTunes, try to find an RSS link in the page HTML
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                # Look for <link rel="alternate" type="application/rss+xml" href="...">
                rss_m = re.search(r'type="application/rss\+xml".*?href=["\'](https?://[^"\']+)["\']', html, re.IGNORECASE)
                if not rss_m:
                    rss_m = re.search(r'href=["\'](https?://[^"\']+)["\'].*?type="application/rss\+xml"', html, re.IGNORECASE)
                
                if rss_m:
                    return rss_m.group(1), target_title, target_guid
        except Exception:
            pass

        return url, target_title, target_guid

    def _fetch_rss_metadata(self, url: str, target_title: Optional[str] = None, target_guid: Optional[str] = None) -> tuple[dict, Optional[str]]:
        """
        Parse RSS/Atom feed to find metadata and <enclosure> MP3 URL.
        If target_guid or target_title is provided, searches for a matching item.
        """
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Distill/1.0 (podcast metadata fetcher)",
                "Accept": "application/rss+xml, application/xml, text/xml, */*"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read().decode("utf-8", errors="replace")

            # Find all <item> blocks
            items = re.findall(r"<item>(.*?)</item>", content, re.DOTALL | re.IGNORECASE)
            if not items:
                return {}, None
            
            target_item = items[0] # Default to latest
            
            # Search by GUID first (most accurate for Apple)
            if target_guid:
                for item_xml in items:
                    g_m = re.search(r"<guid.*?>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</guid>", item_xml, re.DOTALL | re.IGNORECASE)
                    if g_m and target_guid in g_m.group(1):
                        target_item = item_xml
                        target_title = None # Stop searching by title if we found by GUID
                        break

            if target_title:
                best_match = None
                best_score = 0
                normalized_target = target_title.lower().strip()
                target_words = set(re.findall(r"\w+", normalized_target))
                
                for item_xml in items:
                    t_m = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item_xml, re.DOTALL | re.IGNORECASE)
                    if t_m:
                        item_title = t_m.group(1).lower().strip()
                        
                        # 1. Direct or substring match (Fast)
                        if normalized_target in item_title or item_title in normalized_target:
                            best_match = item_xml
                            break
                        
                        # 2. Score word overlap (Fuzzy)
                        item_words = set(re.findall(r"\w+", item_title))
                        if not target_words or not item_words: continue
                        
                        overlap = len(target_words.intersection(item_words))
                        score = overlap / len(target_words)
                        if score > best_score:
                            best_score = score
                            best_match = item_xml
                
                # Use best fuzzy match if it meets a threshold (e.g. 50% words match)
                if best_match and (best_score > 0.5 or not best_score):
                    target_item = best_match

            title_m = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", target_item, re.DOTALL | re.IGNORECASE)
            author_m = re.search(r"<itunes:author>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</itunes:author>", target_item, re.DOTALL | re.IGNORECASE)
            desc_m = re.search(r"<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</description>", target_item, re.DOTALL | re.IGNORECASE)
            dur_m = re.search(r"<itunes:duration>(.*?)</itunes:duration>", target_item, re.IGNORECASE)
            
            enclosure_m = re.search(r"<enclosure[^>]+url=[\"']([^\"']+)[\"']", target_item, re.IGNORECASE)
            mp3_url = enclosure_m.group(1) if enclosure_m else None

            duration_seconds = 0
            if dur_m:
                parts = dur_m.group(1).strip().split(":")
                try:
                    if len(parts) == 3:
                        duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    elif len(parts) == 2:
                        duration_seconds = int(parts[0]) * 60 + int(parts[1])
                    elif len(parts) == 1:
                        duration_seconds = int(parts[0])
                except ValueError: pass

            metadata = {
                "title": title_m.group(1).strip() if title_m else "Podcast Episode",
                "author": author_m.group(1).strip() if author_m else "Unknown Host",
                "description": desc_m.group(1).strip()[:500] if desc_m else "",
                "duration_seconds": duration_seconds,
            }
            return metadata, mp3_url
        except Exception:
            return {}, None
