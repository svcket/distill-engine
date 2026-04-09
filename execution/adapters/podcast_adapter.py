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
import json
import os
from typing import Optional
from .base_adapter import BaseAdapter, NormalizedSource


def is_generic_title(title: str) -> bool:
    """Check if the provided title is a generic platform placeholder."""
    if not title: return True
    generic_terms = [
        "podcast episode", "episode", "podcast", "full episode", 
        "spotify - web player", "spotify \u2013 web player", "page not found",
        "unknown", "untitled", "direct audio source", "spotify",
        "listen to episodes", "play on spotify", "404", "error", "forbidden", "access denied"
    ]
    t_lower = title.lower().strip()
    # Check for exact matches in generic terms
    if any(term == t_lower for term in generic_terms): return True
    
    # Check for specific suspicious substrings
    suspicious_substrings = ["web player", "webplayer", "page not found", "404", "access denied"]
    if any(sub in t_lower for sub in suspicious_substrings): return True
    
    # Check for very short or purely numeric titles
    return len(t_lower) < 3 or t_lower.isdigit()



# ─── Metadata Recovery Helpers ──────────────────────────────────────────────
def recover_title_from_text(text: str, current_title: str) -> tuple[Optional[str], Optional[str]]:
    """Use GPT-4o-mini to extract a real title/show from a messy text snippet."""
    if not text or len(text) < 50: return None, None
    try:
        from openai import OpenAI
        import json
        client = OpenAI()
        prefix = text[:3000]
        prompt = f"""
        Identify the podcast episode title and show name from the following text (which could be show notes or a partial transcript).
        
        Current (possibly generic) title: {current_title}
        Text:
        {prefix}
        
        Return ONLY a JSON object with 'title' and 'show_name'. If unsure, return null for those fields.
        """
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        res = json.loads(response.choices[0].message.content)
        return res.get("title"), res.get("show_name")
    except Exception as e:
        print(f"[MetadataRescue] AI recovery failed: {e}")
        return None, None


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
        r"\.rss(?:\?|$)",
        r"\.xml(?:\?|$)",
        r"/feed(?:s)?/?(?:\?|$)",
        r"/rss/?(?:\?|$)",
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
        
        # 2. Apple ID extraction — check FULL url for episode ID (?i=) before fallback to channel ID
        elif "podcasts.apple.com" in url.lower():
            # If there's an episode ID in the query, use that as the primary identifier
            i_match = re.search(r"[?&]i=(\d+)", url)
            if i_match:
                source_id = f"apple_{i_match.group(1)}"
            else:
                # Fallback to the channel/show ID from the path
                apple_match = re.search(r"id(\d+)(?:\?|/|$)", url_clean)
                if apple_match:
                    source_id = f"apple_{apple_match.group(1)}"
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
            feed_url, target_title, target_guid, content_show, ld_description, resolved_duration, resolved_preview_url = self._resolve_to_rss_feed_and_title(url)
            
            # 3. Extract metadata and direct MP3 url from the feed
            metadata, mp3_url = self._fetch_rss_metadata(feed_url, target_title, target_guid)
            
            # Use resolved preview URL if RSS failed to find an enclosure
            if not mp3_url and resolved_preview_url:
                mp3_url = resolved_preview_url

        # If we successfully found an MP3, we override the URL so yt-dlp downloads the raw audio natively
        final_extract_url = mp3_url if mp3_url else url

        # RESCUE LOGIC: If no MP3 and we're on a platform with guarded audio, check for high-quality show notes
        # content_show and ld_description come from the resolved page (Spotify/Apple)
        description = metadata.get("description", "") or ld_description or ""
        status = "pending_whisper"
        strategy = "audio_fallback"
        
        # GUARD: Reject generic titles for audio rescue
        current_title = metadata.get("title") or target_title or ""
        is_generic = is_generic_title(current_title)

        if is_generic:
             # Attempt AI recovery if description is available
             ai_title, ai_show = recover_title_from_text(description, current_title)
             if ai_title:
                 print(f"[PodcastAdapter] AI Recovery Success: '{current_title}' -> '{ai_title}'")
                 current_title = ai_title
                 is_generic = False
             else:
                 print(f"[PodcastAdapter] REJECTED: Title '{current_title}' is generic. Aborting mission to prevent ghost leaks.")
                 status = "failed_rescue"
                 strategy = "unavailable"
        
        # 4. Greedy Rescue Logic: Only fall back to text rescue if NO audio source (MP3 or YouTube rescue) is available
        is_audio_platform = "spotify.com" in url or "apple.com" in url
        has_audio_source = mp3_url or final_extract_url.startswith("ytsearch1:")

        if not has_audio_source and is_audio_platform:
            if len(description) > 500: 
                 print(f"[PodcastAdapter] No audio source resolved but high-quality description found ({len(description)} chars). Implementing METADATA RESCUE fallback.")
                 status = "rescued_text"
                 strategy = "normalized_text"
            else:
                 print(f"[PodcastAdapter] WARNING: No audio source and poor description ({len(description)} chars). Fetch likely to fail.")
                 status = "failed_rescue"
                 strategy = "unavailable"
        
        return NormalizedSource(
            source_id=source_id,
            source_type=platform_type,
            title=current_title if not is_generic else "Podcast Episode",
            creator=metadata.get("author") or content_show or "Unknown Host",
            url=final_extract_url,
            published_at=metadata.get("published_at"),
            duration_seconds=metadata.get("duration_seconds") or resolved_duration or 0,
            description=description, 
            transcript_status=status,
            transcript_strategy=strategy,
            transcript_source="audio_whisper" if final_extract_url.endswith(".mp3") or ".mp3?" in final_extract_url.lower() else ("rss_description" if status == "rescued_text" else "unknown"),
            language="en",
            source_confidence=0.85 if not is_generic else 0.4,
            raw_metadata={
                **metadata,
                "show_name": content_show,
                "resolved_preview_url": resolved_preview_url,
                "preserved_description": ld_description,
                "rescued_article_text": description if status == "rescued_text" else None,
                "is_generic_title": is_generic
            },
        )



    def _resolve_to_rss_feed_and_title(self, url: str, is_shell: bool = False) -> tuple[str, Optional[str], Optional[str], Optional[str], Optional[str], Optional[int], Optional[str]]:
        """
        Resolve Spotify or Apple Podcast URLs into (feed_url, target_title, target_guid, content_show, description, duration_seconds, preview_url).
        """
        import json
        
        target_title = None
        target_guid = None
        content_show = None
        episode_description = None
        duration_seconds = None
        preview_url = None

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
                    # Try lookup by track ID first if it looks like an episode result was intended
                    lookup_url = f"https://itunes.apple.com/lookup?id={lookup_id}&entity=podcastEpisode"
                    req = urllib.request.Request(lookup_url)
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode())
                        if not data.get("results"):
                             # Fallback to general lookup
                             req = urllib.request.Request(f"https://itunes.apple.com/lookup?id={lookup_id}")
                             with urllib.request.urlopen(req, timeout=5) as resp:
                                 data = json.loads(resp.read().decode())
                        
                        if data.get("results"):
                            res = data["results"][0]
                            # Use trackName or collectionName for title if scraping failed
                            if not target_title or is_generic_title(target_title):
                                target_title = res.get("trackName") or res.get("collectionName")
                            
                            # Extract duration and preview from lookup results
                            duration_seconds = int(res.get("trackTimeMillis", 0) / 1000) if res.get("trackTimeMillis") else None
                            preview_url = res.get("previewUrl")
                            
                            # REJECT PREVIEWS: If this is a short clip (< 20m) and we expect a full episode, ignore it.
                            if preview_url and duration_seconds and duration_seconds < 1200:
                                # Standard previews are 30-180 seconds.
                                # If the expected duration is 10+ mins, the preview is useless.
                                print(f"[PodcastAdapter] Apple Preview/Short clip detected ({duration_seconds}s). Skiping to force full mirror rescue.")
                                preview_url = None

                            return res.get("feedUrl", url), target_title, target_guid, content_show, episode_description, duration_seconds, preview_url
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
                if "og:title" not in page_html or "Spotify \u2013 Web Player" in page_html or "Page not found" in page_html:
                    try:
                        # Improved: handle episode, track, show, album, playlist
                        embed_url = re.sub(r"open\.spotify\.com/(track|episode|show|album|playlist)/", r"open.spotify.com/embed/\1/", url).split("?")[0]
                        req = urllib.request.Request(embed_url, headers={"User-Agent": user_agents[1]})
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            page_html = resp.read().decode("utf-8", errors="ignore")
                    except Exception: pass
                
                # 3. ROBUST EXTRACTION (JSON-LD + __NEXT_DATA__)
                episode_name = ""
                content_show = None
                
                # Priority A: __NEXT_DATA__
                try:
                    next_data_m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page_html)
                    if next_data_m:
                        data = json.loads(next_data_m.group(1))
                        page_props = data.get("props", {}).get("pageProps", {})
                        entity = page_props.get("episode") or page_props.get("track") or page_props.get("show")
                        if entity:
                            if entity.get("name"): episode_name = html.unescape(entity["name"])
                            if entity.get("description"): episode_description = html.unescape(entity["description"])
                            show_data = entity.get("show") or page_props.get("show")
                            if show_data and show_data.get("name"):
                                content_show = html.unescape(show_data["name"])
                except Exception: pass

                # Priority B: JSON-LD
                try:
                    ld_json_matches = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page_html, re.DOTALL)
                    for ld_match in ld_json_matches:
                        try:
                            ld_data = json.loads(ld_match.strip())
                            if isinstance(ld_data, dict):
                                if ld_data.get("name") and not episode_name:
                                    episode_name = html.unescape(ld_data["name"])
                                if ld_data.get("partOfSeries", {}).get("name") and not content_show:
                                    content_show = html.unescape(ld_data["partOfSeries"]["name"])
                                if ld_data.get("description") and not episode_description:
                                    episode_description = html.unescape(ld_data["description"])
                        except Exception: continue
                except Exception: pass

                # Fallback to Title Regex if both failed
                clean_target = ""
                if not episode_name or not content_show:
                    og_title = re.search(r'property="og:title" content="(.*?)"', page_html) or \
                               re.search(r'<title>(.*?)</title>', page_html)
                    if og_title:
                        raw_title = html.unescape(og_title.group(1)).strip()
                        # Reject generic Spotify titles
                        if "Web Player" in raw_title or "Page not found" in raw_title:
                            raw_title = ""
                        
                        if raw_title:
                            clean_target = raw_title.replace(" | Spotify", "").replace(" - Spotify", "").strip()
                        parts = re.split(r"\s*[|\-\xb7\u2022·\u2013]\s*", clean_target)
                        if not episode_name: episode_name = parts[0].strip()
                        if not content_show and len(parts) > 1:
                            content_show = parts[1].replace("Podcast on Spotify", "").replace("Spotify", "").strip()

                    if not content_show:
                        creator_m = re.search(r'property="music:creator" content="(.*?)"', page_html)
                        if creator_m: content_show = html.unescape(creator_m.group(1).strip())
                        footer_m = re.search(r'Listen to (.*?) on Spotify', page_html)
                        if footer_m:
                            content_show = html.unescape(footer_m.group(1).strip())

                # Final cleaning for episode name (RUNS ALWAYS)
                # Strip Season/Episode prefixes and common garbage
                episode_name_clean = re.sub(r"^(?:Season|Episode|Ep|S|E)?\s*\d+[:\s-]*(?:Episode|Ep|E)?\s*\d*[:\s-]*", "", episode_name, flags=re.IGNORECASE).strip()
                episode_name_clean = re.sub(r"^Podcast Episode\s*\d*[:\s-]*", "", episode_name_clean, flags=re.IGNORECASE).strip()
                target_title = episode_name_clean
                
                # Build prioritized search queries (RUNS ALWAYS)
                queries = []
                
                # IF IN SHELL MODE: We skip the expensive iTunes search to provide immediate UI feedback.
                # We just return the target_title scraped from the page.
                if is_shell:
                    return url, target_title, None, content_show, episode_description, duration_seconds, preview_url

                best_show = content_show
                if episode_name_clean and best_show:
                    queries.append({"q": f"{episode_name_clean} {best_show}", "ent": "podcastEpisode"})
                if episode_name_clean and len(episode_name_clean) > 8:
                    queries.append({"q": episode_name_clean, "ent": "podcastEpisode"})
                if best_show:
                    # Try to find the show first, then we can find its feed
                    queries.append({"q": best_show, "ent": "podcast"})
                if clean_target:
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
                                        duration_seconds = int(res.get("trackTimeMillis", 0) / 1000) if res.get("trackTimeMillis") else None
                                        preview_url = res.get("previewUrl")
                                        
                                        # Use iTunes title ONLY if it's better (not generic)
                                        found_title = res.get("trackName")
                                        resolved_title = target_title
                                        if found_title and not is_generic_title(found_title):
                                            resolved_title = found_title
                                            
                                        return res.get("feedUrl", url), resolved_title, target_guid, content_show, episode_description, duration_seconds, preview_url
                                # If no strong match in loop, return first result
                                res = data["results"][0]
                                duration_seconds = int(res.get("trackTimeMillis", 0) / 1000) if res.get("trackTimeMillis") else None
                                preview_url = res.get("previewUrl")
                                
                                # REJECT PREVIEWS: If this is a short clip (< 20m) and we expect a full episode, ignore it.
                                if preview_url and duration_seconds and duration_seconds < 1200:
                                    print(f"[PodcastAdapter] Spotify Preview/Short clip detected ({duration_seconds}s). Skipping to force full mirror rescue.")
                                    preview_url = None

                                found_title = res.get("trackName")
                                resolved_title = target_title
                                if found_title and not is_generic_title(found_title):
                                    resolved_title = found_title
                                    
                                return res.get("feedUrl", url), resolved_title, target_guid, content_show, episode_description, duration_seconds, preview_url
                    except Exception: continue
                # 4. MIRROR SEARCH (Podtail/ListenNotes)
                # If iTunes failed, we search DuckDuckGo for the episode ID on mirror sites.
                if not preview_url and "spotify.com" in url:
                    try:
                        print(f"[PodcastAdapter] iTunes discovery failed. Attempting Mirror Discovery (Podtail)...")
                        spotify_id = re.search(r"episode/([a-zA-Z0-9]+)", url).group(1)
                        mirror_url = f"https://podtail.com/podcast/episode/{spotify_id}/"
                        req_m = urllib.request.Request(mirror_url, headers={"User-Agent": user_agents[1]})
                        with urllib.request.urlopen(req_m, timeout=5) as resp_m:
                            mirror_html = resp_m.read().decode("utf-8", errors="ignore")
                            m_title = re.search(r"<title>(.*?)</title>", mirror_html)
                            if m_title:
                                target_title = html.unescape(m_title.group(1).split(" | ")[0].strip())
                                print(f"[PodcastAdapter] Mirror Recovery Success: {target_title}")
                                return mirror_url, target_title, None, content_show, episode_description, duration_seconds, None
                    except Exception: pass

                # 5. YOTUBE AUDIO FALLBACK (High-Fidelity Rescue)
                # If iTunes failed, we search YouTube for the episode title.
                # yt-dlp handles 'ytsearch1:...' queries natively to find the best matching audio.
                if not preview_url and not target_guid and episode_name_clean:
                    is_generic = False
                    for generic_term in ["podcast episode", "episode", "podcast", "full episode"]:
                        if episode_name_clean.lower().strip() == generic_term:
                            is_generic = True
                            break
                            
                    if is_generic or len(episode_name_clean.strip()) < 4:
                        print(f"[PodcastAdapter] Title '{episode_name_clean}' is too generic. Aborting YouTube rescue.", flush=True)
                        return url, target_title, target_guid, content_show, episode_description, duration_seconds, preview_url
                    
                    yt_query = f"{episode_name_clean} {content_show or ''} podcast"
                    print(f"[PodcastAdapter] iTunes resolution failed. Promoting to YouTube Search Rescue: {yt_query}")
                    return f"ytsearch1:{yt_query.strip()}", target_title, None, content_show, episode_description, duration_seconds, None

            except Exception as e:
                print(f"[PodcastAdapter] Spotify resolution error: {e}")
                pass

        # Handle RSS.com and Simplecast as before
        if "rss.com/podcasts/" in url:
            match = re.search(r"rss\.com/podcasts/([^/]+)", url)
            if match: return f"https://media.rss.com/{match.group(1)}/feed.xml", None, None, None, None, None, None

        if "simplecast.com/episodes/" in url:
            match = re.search(r"([^.]+)\.simplecast\.com/episodes/", url)
            if match: return f"https://feeds.simplecast.com/{match.group(1)}", None, None, None, None, None, None
                
        # Mirror patterns for common podcast hosts (direct audio discovery)
        HOST_MIRRORS = [
            r"megaphone\.fm/",
            r"omny\.fm/",
            r"art19\.com/",
            r"simplecast\.com/",
            r"transistor\.fm/"
        ]

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
                    return rss_m.group(1), target_title, target_guid, content_show, episode_description, duration_seconds, preview_url
        except Exception:
            pass

        return url, target_title, target_guid, content_show, episode_description, duration_seconds, preview_url

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
