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
import html
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
        # Strip tracking/session parameters for consistent hashing
        url_clean = url.strip().split("?")[0]
        
        # 1. Spotify ID extraction — use exactly what's in the URL but ensure it's captured before query params
        spotify_match = re.search(r"spotify\.com/episode/([a-zA-Z0-9]+)", url_clean)
        if spotify_match:
            source_id = f"spotify_{spotify_match.group(1)}"
        
        # Also handle show-level URLs if they slip through
        elif "spotify.com/show/" in url_clean:
             show_match = re.search(r"spotify\.com/show/([a-zA-Z0-9]+)", url_clean)
             source_id = f"spotify_show_{show_match.group(1)}"
        
        # 2. Apple ID extraction
        elif "podcasts.apple.com" in url_clean:
            apple_match = re.search(r"id(\d+)(?:\?|/|$)", url_clean)
            if apple_match:
                # If there's an episode ID (?i=), use that
                i_match = re.search(r"[?&]i=(\d+)", url_clean)
                source_id = f"apple_{i_match.group(1)}" if i_match else f"apple_{apple_match.group(1)}"
            else:
                 source_id = "podcast_" + hashlib.md5(url_clean.encode()).hexdigest()[:12]
        
        # 3. Fallback to hash
        else:
            source_id = "podcast_" + hashlib.md5(url_clean.encode()).hexdigest()[:12]
        
        # Determine specific platform type
        if "spotify.com" in url:
            platform_type = "spotify_podcast"
        elif "podcasts.apple.com" in url or "apple.com" in url:
            platform_type = "apple_podcast"
        else:
            platform_type = "podcast"

        if shell:
            is_direct = url.lower().endswith(".mp3") or ".mp3?" in url.lower() or url.lower().endswith(".m4a") or ".m4a?" in url.lower()
            target_title = "Direct Audio Source" if is_direct else None
            
            if not is_direct:
                try:
                    # PASS is_shell=True to skip expensive iTunes searches during initial ingest
                    _, target_title, _ = self._resolve_to_rss_feed_and_title(url, is_shell=True)
                except Exception as e: 
                    print(f"[PodcastAdapter] Shell title extraction failed for {url}: {e}")
                
            return NormalizedSource(
                source_id=source_id,
                source_type=platform_type,
                title=target_title or "Podcast Episode",
                creator="Podcast",
                url=url,
                transcript_status="unknown",
                source_confidence=0.7,
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
            description = metadata.get("description", "")
            if len(description) < 50:
                 description = "[Transcript Unavailable] Could not resolve a public RSS feed for this Spotify episode."
                 status = "unavailable"
                 strategy = "unavailable"
            else:
                 # RESCUE: We have show notes, use them as the "Transcript"
                 status = "rescued_text"
                 strategy = "normalized_text"
            
        return NormalizedSource(
            source_id=source_id,
            source_type=platform_type,
            title=metadata.get("title") or target_title or (source_id.replace("spotify_", "") if source_id else "Podcast Episode"),
            creator=metadata.get("author", "Unknown Host"),
            url=final_extract_url,
            published_at=metadata.get("published_at"),
            duration_seconds=metadata.get("duration_seconds", 0),
            description=description[:1000], 
            transcript_status=status,
            transcript_strategy=strategy,
            transcript_source="audio_whisper" if mp3_url else ("rss_description" if status == "rescued_text" else "unknown"),
            language="en",
            source_confidence=0.85,
            raw_metadata={
                **metadata,
                "rescued_article_text": description if status == "rescued_text" else None
            },
        )


    def _resolve_to_rss_feed_and_title(self, url: str, is_shell: bool = False) -> tuple[str, Optional[str], Optional[str]]:
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
                    page_content = resp.read().decode("utf-8", errors="ignore")
                    og_title = re.search(r'<meta property="og:title" content="(.*?)"', page_content)
                    if og_title:
                        raw_t = og_title.group(1).split(" on Apple Podcasts")[0].strip()
                        target_title = html.unescape(raw_t).strip()
                    else:
                        title_m = re.search(r"<title>(.*?)</title>", page_content)
                        if title_m:
                            raw_t = title_m.group(1).split(" on Apple Podcasts")[0].strip()
                            target_title = html.unescape(raw_t).strip()

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
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                ]
                
                page_html = ""
                for ua in user_agents:
                    try:
                        req = urllib.request.Request(url, headers={
                            "User-Agent": ua,
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                            "Accept-Language": "en-US,en;q=0.5"
                        })
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            page_html = resp.read().decode("utf-8", errors="ignore")
                            if "og:title" in page_html or "<title>" in page_html: break
                    except Exception: continue
                
                # 2. Try Embed URL if main URL failed to yield metadata
                if "og:title" not in page_html or "Spotify \u2013 Web Player" in page_html:
                    try:
                        embed_url = url.replace("open.spotify.com/episode/", "open.spotify.com/embed/episode/").split("?")[0]
                        req = urllib.request.Request(embed_url, headers={"User-Agent": user_agents[1]})
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            page_html = resp.read().decode("utf-8", errors="ignore")
                    except Exception: pass
                
                og_title = re.search(r'property="og:title" content="(.*?)"', page_html)
                if not og_title or "Spotify \u2013 Web Player" in og_title.group(1):
                    # Try Twitter/Meta title
                    og_title = re.search(r'name="(?:twitter|title)" content="(.*?)"', page_html)
                    if not og_title:
                        og_title = re.search(r'<title>(.*?)</title>', page_html, re.DOTALL | re.IGNORECASE)

                if og_title:
                    episode_name = ""
                    try:
                        raw_title = html.unescape(og_title.group(1)).strip()
                    except Exception:
                        raw_title = og_title.group(1).strip()
                    
                    # If we got the generic Spotify title, ignore it and keep searching
                    if "Spotify – Web Player" in raw_title or "Spotify - Web Player" in raw_title:
                        raw_title = None
                    
                    if raw_title:
                        # IMPROVED: Handle common Spotify title patterns more cleanly
                        # Usually "Episode Title | Show Name" or "Episode Title · Show Name"
                        clean_target = raw_title.replace(" | Spotify", "").replace(" - Spotify", "").strip()
                        
                        # Use first half before separator if the title seems merged
                        parts = re.split(r" [|\xb7\u2022\xb7\-] ", clean_target)
                        episode_name = parts[0].strip() if len(parts) > 1 else clean_target
                        show_name_guess = parts[-1].strip() if len(parts) > 1 else None
                    
                    # Strip "Season X Episode Y" or "Episode 123" prefixes from episode name
                    episode_name_clean = re.sub(r"^(?:Season|Episode|Ep|S|E)?\s*\d+[:\s-]*(?:Episode|Ep|E)?\s*\d*[:\s-]*", "", episode_name, flags=re.IGNORECASE).strip()
                    target_title = episode_name_clean
                    
                    # Clean the episode name specifically for better searching
                    clean_episode = re.sub(r"Season\s*\d+", "", episode_name, flags=re.IGNORECASE).strip()

                    # Also try to find the creator/show name directly in meta
                    # Spotify descriptions often start with "Show Name · Episode"
                    show_m = re.search(r'property="og:description" content="(.*?)(?: \xb7| \u2022| ·)', page_html)
                    content_show = None
                    if show_m:
                        content_show = html.unescape(show_m.group(1).strip())
                    
                    # Build prioritized search queries
                    queries = []
                    
                    # IF IN SHELL MODE: We skip the expensive iTunes search to provide immediate UI feedback.
                    # We just return the target_title scraped from the page.
                    if is_shell:
                        return url, target_title, None

                    best_show = show_name_guess or content_show
                    if episode_name_clean and best_show:
                        queries.append({"q": f"{episode_name_clean} {best_show}", "ent": "podcastEpisode"})
                    if len(episode_name_clean) > 8:
                        queries.append({"q": episode_name_clean, "ent": "podcastEpisode"})
                    if best_show:
                        # NEW: Try to find the show first, then we can find its feed
                        queries.append({"q": best_show, "ent": "podcast"})
                    queries.append({"q": clean_target, "ent": "podcastEpisode"})
                    
                    for sq in queries:
                        search_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(sq['q'])}&entity={sq['ent']}&limit=10"
                        req2 = urllib.request.Request(search_url, headers={"User-Agent": user_agents[1]})
                        try:
                            with urllib.request.urlopen(req2, timeout=5) as resp2:
                                data = json.loads(resp2.read().decode())
                                if data.get("results"):
                                    # Filter results for best title match
                                    for res in data["results"]:
                                        res_title = res.get("trackName", "").lower()
                                        if episode_name_clean.lower() in res_title or res_title in episode_name_clean.lower():
                                            return res.get("feedUrl", url), target_title, target_guid
                                    # If no strong match in loop, return first result
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
                resp_html = resp.read().decode("utf-8", errors="ignore")
                # Look for <link rel="alternate" type="application/rss+xml" href="...">
                rss_m = re.search(r'type="application/rss\+xml".*?href=["\'](https?://[^"\']+)["\']', resp_html, re.IGNORECASE)
                if not rss_m:
                    rss_m = re.search(r'href=["\'](https?://[^"\']+)["\'].*?type="application/rss\+xml"', resp_html, re.IGNORECASE)
                
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
                        
                        # 1. Direct or significant substring match (Priority)
                        if normalized_target == item_title:
                            best_match = item_xml
                            best_score = 1.0
                            break
                        
                        if normalized_target in item_title or item_title in normalized_target:
                            # Higher score for substrings
                            score = 0.9 if len(normalized_target) > 10 else 0.7
                            if score > best_score:
                                best_score = score
                                best_match = item_xml
                        
                        # 2. Score word overlap (Fuzzy)
                        item_words = set(re.findall(r"\w+", item_title))
                        if not target_words or not item_words: continue
                        
                        overlap = len(target_words.intersection(item_words))
                        score = overlap / len(target_words)
                        if score > best_score:
                            best_score = score
                            best_match = item_xml
                
                # Use best fuzzy match if it meets a reasonable threshold (0.5)
                if best_match and best_score >= 0.5:
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
                "title": html.unescape(title_m.group(1).strip()) if title_m else "Podcast Episode",
                "author": html.unescape(author_m.group(1).strip()) if author_m else "Unknown Host",
                "description": html.unescape(desc_m.group(1).strip())[:500] if desc_m else "",
                "duration_seconds": duration_seconds,
            }
            return metadata, mp3_url
        except Exception:
            return {}, None
