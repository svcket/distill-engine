"""
Transcript Harvester — multi-source transcript fetcher.
Routes to the appropriate adapter based on source type.
Supports: YouTube (youtube_transcript_api), Vimeo (manual), Podcast/Upload (Whisper stub).
"""

import sys
import argparse
import json
import os
import re
import datetime
from typing import Optional

def determine_transcript_strategy(source_id: str, metadata: dict) -> tuple[str, str]:
    """
    Decide the best route for fetching a transcript based on source type and capability.
    Returns (strategy, source_method)
    Strategies: direct | normalized_text | audio_fallback | unavailable
    Methods: api | vtt_srt | rss_content | audio_whisper
    """
    source_type = metadata.get("source_type")
    url = metadata.get("url", "")

    # 1. YouTube: Direct API is best
    if source_type == "youtube":
        return "direct", "api"

    # 2. Vimeo: Prefer Direct (Subtitles), then Fallback (Whisper) if captions exist
    if source_type == "vimeo":
        # We'll refine this later with a pre-flight check, for now allow attempt
        return "direct", "vtt_srt"

    # 3. Podcast: Check for platform URLs or MP3 resolution
    if source_type in ("podcast", "apple_podcast", "spotify") or "spotify.com" in url or "podcasts.apple.com" in url or "rss.com" in url:
        # If it's a known platform, we'll try Whisper strategy even without explicit .mp3
        # (yt-dlp handles many of these platform URLs natively)
        if "spotify.com" in url or "apple.com" in url or "rss.com" in url or source_type in ("apple_podcast", "spotify"):
            return "audio_fallback", "audio_whisper"
        
        # Fallback check for direct audio extensions
        if any(ext in url.lower() for ext in [".mp3", ".m4a", ".wav", ".aac", ".ogg"]):
            return "audio_fallback", "audio_whisper"
            
        return "audio_fallback", "audio_whisper" # Try it anyway if typed as podcast

    # 4. RSS: Use normalized text pathway
    if source_type == "rss":
        return "normalized_text", "rss_content"

    # 5. Twitter/X: Use rescued text if available (unrolled by adapter)
    if source_type == "twitter":
        return "normalized_text", "unrolled_thread"

    # 6. Documents: Use rescued text if available (extracted by adapter)
    if source_type == "document":
        return "normalized_text", "doc_extraction"

    # 7. Uploads / Recordings: Direct audio fallback
    if source_type in ("upload", "recording"):
        return "audio_fallback", "audio_whisper"

    return "unavailable", "unsupported_source"


def extract_video_id(url_or_id: str) -> str:
    """Extract YouTube video ID from URL or return bare ID."""
    if "v=" in url_or_id:
        return url_or_id.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url_or_id:
        return url_or_id.split("youtu.be/")[1].split("?")[0]
    return url_or_id


def load_source_metadata(source_id: str) -> dict:
    """Load normalized source from .tmp/judgments/ or .tmp/sources/."""
    base = os.path.dirname(__file__)
    import time

    # 1. Try exact source metadata file first (Most detailed)
    direct = os.path.join(base, ".tmp", "sources", f"{source_id}.json")
    
    # Add a small retry loop to handle file system eventual consistency (first-run race condition)
    for attempt in range(3):
        if os.path.exists(direct):
            try:
                with open(direct, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data[0] if isinstance(data, list) and data else data
            except Exception:
                pass
        if attempt < 2:
            time.sleep(0.5)

    # 2. Loop through discovery files
    import glob
    for file in glob.glob(os.path.join(base, ".tmp", "sources", "*.json")):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("source_id") == source_id or item.get("video_id") == source_id:
                    return item
        except Exception:
            pass

    # 3. Try judgments fallback
    judg_path = os.path.join(base, ".tmp", "judgments", f"{source_id}_judgment.json")
    if os.path.exists(judg_path):
        try:
            with open(judg_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "url" not in data:
                    data["url"] = f"https://youtube.com/watch?v={source_id}"
                return data
        except Exception:
            pass

    return {"source_id": source_id, "source_type": "youtube"}


def merge_segments(segments: list, max_segments: int) -> list:
    """Merge adjacent segments to reach a target maximum count while preserving timing."""
    if not segments or len(segments) <= max_segments:
        return segments

    # Calculate grouping size
    total_segments = len(segments)
    group_size = (total_segments + max_segments - 1) // max_segments
    
    merged = []
    for i in range(0, total_segments, group_size):
        group = segments[i:i + group_size]
        if not group:
            continue
            
        merged_text = " ".join(str(s.get("text", "")).strip() for s in group if s.get("text")).strip()
        if not merged_text:
            continue
            
        merged.append({
            "text": merged_text,
            "start": group[0].get("start", 0),
            "duration": sum(s.get("duration", 0) for s in group)
        })
        
    # Aggressive merging to reach target count
    while len(merged) > max_segments:
        # Find smallest pair
        best_idx = -1
        min_combined_duration = float('inf')
        
        for i in range(len(merged) - 1):
            combined = merged[i]["duration"] + merged[i+1]["duration"]
            if combined < min_combined_duration:
                min_combined_duration = combined
                best_idx = i
        
        if best_idx == -1: break # Should not happen if len(merged) > 1
        
        # Merge best_idx and best_idx + 1
        m1 = merged[best_idx]
        m2 = merged[best_idx + 1]
        new_seg = {
            "text": m1["text"] + " " + m2["text"],
            "start": m1["start"],
            "duration": m1["duration"] + m2["duration"]
        }
        # Replace the pair with the merged segment
        merged[best_idx:best_idx+2] = [new_seg]
        
    return merged


def fetch_youtube_transcript(source_id: str, output_dir: str, max_segments: int = 100) -> dict:
    """Fetch YouTube transcript via youtube_transcript_api with simple fallback."""
    from youtube_transcript_api import YouTubeTranscriptApi
    
    api = YouTubeTranscriptApi()
    
    # fetch is an instance method in this version
    try:
        transcript = api.fetch(source_id, languages=['en', 'en-US', 'en-GB'])
    except Exception as e:
        try:
            # Final fallback: any language
            transcript = api.fetch(source_id)
        except:
            raise Exception(f"Failed to fetch any transcript for {source_id}: {str(e)}")

    transcript_list = []
    for chunk in transcript:
        transcript_list.append({
            "text": getattr(chunk, "text", ""),
            "start": getattr(chunk, "start", 0),
            "duration": getattr(chunk, "duration", 0),
        })

    # NEW: Apply segment merging to hasten downstream processing
    if max_segments and len(transcript_list) > max_segments:
        print(f"[{source_id}] Merging {len(transcript_list)} segments into max {max_segments}...")
        transcript_list = merge_segments(transcript_list, max_segments)

    json_path = os.path.join(output_dir, f"{source_id}_raw.json")
    txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transcript_list, f, indent=2)

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(" ".join(str(c.get("text", "")) for c in transcript_list))

    return {
        "source_id": source_id,
        "status": "success",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(transcript_list),
        "chunk_count": len(transcript_list),
        "segments": transcript_list[:100]
    }


def resolve_apple_podcast_audio(url: str) -> str:
    """Uses iTunes API to find the direct episodeUrl for an Apple Podcasts page."""
    import urllib.request
    import json
    try:
        # Extract ID from URL
        m = re.search(r"/id(\d+)", url)
        if not m: return url
        collection_id = m.group(1)
        
        # If it's an episode link, it usually has ?i=EPISODE_ID
        ep_match = re.search(r"[?&]i=(\d+)", url)
        lookup_url = f"https://itunes.apple.com/lookup?id={collection_id}&entity=podcastEpisode"
        
        req = urllib.request.Request(lookup_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.load(resp)
            
        results = data.get("results", [])
        if not results: return url
        
        # If we have an episode ID, find the exact match
        if ep_match:
            ep_id = int(ep_match.group(1))
            for res in results:
                if res.get("trackId") == ep_id:
                    return res.get("episodeUrl") or res.get("previewUrl") or url
        
        # Otherwise return the latest episode's url if results[1] exists (results[0] is the collection)
        if len(results) > 1:
            return results[1].get("episodeUrl") or results[1].get("previewUrl") or url
            
    except Exception as e:
        print(f"iTunes Resolution failed: {e}")
    return url

def resolve_spotify_via_itunes(title: str, show_name: Optional[str] = None) -> Optional[str]:
    """Try to find a public Apple Podcast link for a Spotify episode via Title search."""
    import urllib.request
    import urllib.parse
    import json
    import re
    
    try:
        # 1. Improved Title Cleaning (Sync with adapter)
        # Handle pipe and bullet separators
        clean_title = title.split("|")[0].split("\u2022")[0].strip()
        
        # Strip "Season X Episode Y" or "Episode 123" prefixes
        clean_title = re.sub(r'^(?:Season|Episode|Ep|S|E)?\s*\d+[:\s-]*(?:Episode|Ep|E)?\s*\d*[:\s-]*', '', clean_title, flags=re.IGNORECASE).strip()
        
        # Fallback if too aggressive
        if len(clean_title) < 5:
             clean_title = title.split("|")[0].split("\u2022")[0].strip()

        # Derive episode vs show
        # Most Spotify og:titles are "Episode Title - Show Name"
        parts = clean_title.split(" - ")
        derived_show = parts[-1].strip() if len(parts) > 1 else None
        episode_name = " - ".join(parts[:-1]).strip() if len(parts) > 1 else clean_title

        def itunes_search(q, entity="podcastEpisode"):
            encoded_query = urllib.parse.quote(q)
            search_url = f"https://itunes.apple.com/search?term={encoded_query}&entity={entity}&limit=10"
            print(f"[Spotify-Resolver] Searching iTunes: {q} ({entity})")
            req = urllib.request.Request(search_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.load(resp)
            return data.get("results", [])

        # Build prioritized search queries
        queries = []
        best_show = derived_show or show_name
        
        if episode_name and best_show:
            queries.append({"q": f"{episode_name} {best_show}", "ent": "podcastEpisode"})
        if len(episode_name) > 10:
            queries.append({"q": episode_name, "ent": "podcastEpisode"})
        if best_show:
            queries.append({"q": best_show, "ent": "podcast"})
        queries.append({"q": clean_title, "ent": "podcastEpisode"})

        results = []
        for q_obj in queries:
            results = itunes_search(q_obj["q"], q_obj["ent"])
            if results: break

        # Matching Logic
        if results:
            best_match = None
            best_score = 0
            
            target_t = episode_name.lower()
            target_s = (best_show or "").lower()
            
            for res in results:
                res_t = res.get("trackName", "").lower()
                res_s = res.get("collectionName", "").lower()
                
                # 1. Exact match (Priority)
                if target_t == res_t:
                    best_match = res
                    best_score = 1.0
                    break
                
                # 2. Substring or Score
                score = 0
                if target_t in res_t or res_t in target_t:
                    score = 0.8
                else:
                    t_words = set(re.findall(r"\w+", target_t))
                    r_words = set(re.findall(r"\w+", res_t))
                    if t_words:
                        score = len(t_words.intersection(r_words)) / len(t_words)
                
                # Boost if show matches
                if target_s and target_s in res_s:
                    score += 0.2
                
                if score > best_score:
                    best_score = score
                    best_match = res

            if best_match and best_score >= 0.7:
                found_url = best_match.get("episodeUrl") or best_match.get("previewUrl")
                if found_url:
                    print(f"[Spotify-Resolver] DRM RESCUE ({'Exact' if best_score == 1.0 else 'Fuzzy'}): {best_match.get('trackName')}")
                    return found_url
                    
    except Exception as e:
        print(f"[Spotify-Resolver] Spotify Search Fallback failed: {e}")
    return None

def extract_spotify_title(url: str) -> Optional[str]:
    """Robust title extraction from Spotify page using mobile UA and embed fallback."""
    try:
        import urllib.request
        import re
        
        user_agents = [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ]
        
        html = ""
        for ua in user_agents:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": ua})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
                    if "og:title" in html: break
            except: continue
            
        # Try Embed URL if main URL failed to yield metadata in header
        if "og:title" not in html or "Spotify \u2013 Web Player" in html:
            try:
                embed_url = url.replace("open.spotify.com/episode/", "open.spotify.com/embed/episode/").split("?")[0]
                req = urllib.request.Request(embed_url, headers={"User-Agent": user_agents[1]})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    embed_html = resp.read().decode("utf-8", errors="ignore")
                    if "og:title" in embed_html:
                        html = embed_html
            except: pass

        og_title = re.search(r'property="og:title" content="(.*?)"', html)
        if not og_title or "Spotify \u2013 Web Player" in og_title.group(1):
            # Try Twitter title
            og_title = re.search(r'name="twitter:title" content="(.*?)"', html)
            
        if not og_title or "Spotify \u2013 Web Player" in og_title.group(1):
            # Try schema.json if available in raw html
            schema_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
            if schema_match:
                try:
                    import json
                    schema_data = json.loads(schema_match.group(1))
                    if isinstance(schema_data, dict) and "name" in schema_data:
                        return schema_data["name"]
                except: pass

            og_title = re.search(r'<title>(.*?)</title>', html)
            
        if og_title:
            # Only split by pipes and bullets (platform separators)
            title = og_title.group(1).split("|")[0].split("\u2022")[0].strip()
            # If title is still generic, it's a failure
            if "Spotify" in title and "Web Player" in title: return None
            return title
    except:
        pass
    return None

def fetch_whisper_transcript(source_id: str, source_url: str, output_dir: str, is_local_source: bool = False, referer: str = None) -> dict:
    """
    Whisper-based transcription using yt-dlp to download and OpenAI to transcribe.
    """
    import subprocess
    import glob
    from openai import OpenAI
    
    # 1. Download audio via yt-dlp
    ffmpeg_exe = None
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass

    # 1. NEW: Check if the URL is actually a local file or upload:// URI
    audio_file_path = None
    
    # Resolve upload:// and recording:// protocols
    resolved_url = source_url
    if source_url.startswith("upload://"):
        resolved_url = source_url.replace("upload://", "")
    elif source_url.startswith("recording://"):
        resolved_url = source_url.replace("recording://", "")
        
    if os.path.exists(resolved_url) and os.path.isfile(resolved_url):
        print(f"[{source_id}] Source is a local file: {resolved_url}. Skipping download logic.")
        audio_file_path = resolved_url
        is_local_source = True
    else:
        is_local_source = False

    if not is_local_source:
        is_platform_url = ("spotify.com" in source_url) or ("podcasts.apple.com" in source_url)
                          
        if is_platform_url:
            print(f"[{source_id}] WARNING: This platform often isolates audio. Attempting rescue via yt-dlp/Whisper...")
            # We don't raise Exception here anymore, let yt-dlp try its best 
            # (which handles some public endpoints) or whisper-timestamped if localized.

        # 1. NEW: Try to fetch native subtitles first (Lightening Speed)
        sub_path_template = os.path.join(output_dir, f"{source_id}_subs")
        # Normalize Vimeo URLs to player-embed if it's a standard link to avoid login walls
        # Use a more robust extraction to handle hidden/private videos if possible
        if "vimeo.com" in source_url:
            v_match = re.search(r"vimeo\.com/(?:video/)?(\d+)", source_url)
            if v_match:
                source_url = f"https://player.vimeo.com/video/{v_match.group(1)}"

        sub_cmd = [
            "python3", "-m", "yt_dlp",
            "--skip-download",
            "--no-check-certificates",
            "--prefer-free-formats",
            "--no-warnings",
            "--write-subs",
            "--sub-langs", "en.*,.*-en.*",
            "--sub-format", "vtt/srt/best",
            "-o", sub_path_template,
            source_url
        ]
        
        try:
            # Add Referer for Vimeo especially
            headers = [
                "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "--add-header", "Referer:https://vimeo.com/",
                "--add-header", "Origin:https://vimeo.com/"
            ]
            
            subprocess.run(sub_cmd + headers, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            # Look for downloaded subs
            sub_files = glob.glob(f"{sub_path_template}.*.vtt") + glob.glob(f"{sub_path_template}.*.srt")
            if sub_files:
                sub_file = sub_files[0]
                print(f"[{source_id}] Native subtitles found! Parsing {os.path.basename(sub_file)}...")
                
                transcript_list = []
                try:
                    # Basic VTT/SRT parser for lightning speed
                    with open(sub_file, "r", encoding="utf-8") as f:
                        content = f.read()
                        
                    # Very simple regex-based segment extraction
                    # Matches patterns like 00:00:00.000 --> 00:00:05.000 or 00:00,000 --> 00:00,000
                    blocks = re.split(r'\n\s*\n', content)
                    for block in blocks:
                        time_match = re.search(r'(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})', block)
                        if time_match:
                            start_str, end_str = time_match.groups()
                            # Convert HH:MM:SS.mmm to seconds
                            def to_sec(s):
                                h, m, s_ms = s.replace(',', '.').split(':')
                                return int(h) * 3600 + int(m) * 60 + float(s_ms)
                            
                            start = to_sec(start_str)
                            end = to_sec(end_str)
                            text = re.sub(r'<[^>]+>', '', re.sub(r'^\d+\n', '', block.split('-->')[-1].split('\n', 1)[-1], flags=re.MULTILINE)).strip()
                            if text:
                                transcript_list.append({"text": text, "start": start, "duration": end - start})
                    
                    if transcript_list:
                        # Success! Clean up and return
                        for sf in sub_files: os.remove(sf)
                        return finish_transcript(source_id, transcript_list, output_dir)
                except Exception as pe:
                    print(f"[{source_id}] Subtitle parse failed: {pe}. Falling back to Whisper.")

        except Exception as se:
            print(f"[{source_id}] Subtitle fetch attempt failed: {se}")

    # 2. Existing Whisper Fallback (Optimized)
    # audio_file_path is already initialized if it's a local file.
    
    if not audio_file_path: # Correctly wrap download logic
        # PHASE 0: Pre-flight resolution for Apple Podcasts / Spotify
        if "podcasts.apple.com" in source_url:
            print(f"[{source_id}] APPLE PODCAST: Attempting iTunes API audio resolution...")
            source_url = resolve_apple_podcast_audio(source_url)
            print(f"[{source_id}] Resolved URL: {source_url}")
        elif "spotify.com" in source_url:
            print(f"[{source_id}] SPOTIFY: Detecting likely DRM. Attempting search rescue...")
            metadata = load_source_metadata(source_id)
            title = metadata.get("title")
            show_name = metadata.get("channel")
            
            if not title:
                # Direct page extraction if metadata file is stale/empty
                title = extract_spotify_title(source_url)
                print(f"[{source_id}] SPOTIFY: Extracted title from page: {title}")

            if title:
                rescued_url = resolve_spotify_via_itunes(title, show_name)
                if rescued_url:
                    source_url = rescued_url
                    print(f"[{source_id}] Spotify-to-Apple Rescue: {source_url}")
                    # If rescued to Apple, MUST resolve to direct audio now
                    if "podcasts.apple.com" in source_url:
                        source_url = resolve_apple_podcast_audio(source_url)
                        print(f"[{source_id}] Resolved Rescued URL: {source_url}")

        temp_audio = os.path.join(output_dir, f"{source_id}_audio")
        print(f"[{source_id}] Attempting download to {temp_audio}")
        cmd = [
            "python3", "-m", "yt_dlp",
            "--force-overwrites",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "9", # EXTREME optimization: 9 (worst quality) is sufficient for Whisper and downloads ~5x faster than 0
            "-f", "bestaudio/worst", 
            "-o", f"{temp_audio}.%(ext)s"
        ]
        if ffmpeg_exe:
            cmd.extend(["--ffmpeg-location", ffmpeg_exe])
        if referer:
            cmd.extend(["--referer", referer])
        
        # Add robust flags for common platform blocks
        cmd.extend([
            "--no-check-certificates",
            "--no-warnings",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ])
        
        # Vimeo-specific impersonation fix
        if "vimeo.com" in source_url:
            cmd.extend(["--referer", "https://vimeo.com/"])
        elif "apple.com" in source_url:
            cmd.extend(["--referer", "https://podcasts.apple.com/"])
        
        cmd.append(source_url)
        
        # yt-dlp retry loop for transient network issues
        last_err = None
        fatal_error = False
        for attempt in range(3): # Increased to 3 for higher reliability
            try:
                # Use a 120s timeout to prevent hanging on slow streams
                proc = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
                last_err = None
                break
            except subprocess.TimeoutExpired:
                last_err = "Download timed out after 120s (likely slow connection)."
            except subprocess.CalledProcessError as e:
                err_text = e.stderr.decode() if e.stderr else "Unknown yt-dlp error"
                
                # Check for fatal errors that shouldn't be retried
                if "403" in err_text or "Forbidden" in err_text:
                    last_err = "Access Denied (403). The source may be private, age-restricted, or blocked in this region."
                    fatal_error = True
                    break
                if "429" in err_text or "Too Many Requests" in err_text:
                    last_err = "Rate Limited (429) by the platform. Please try again in 5 minutes."
                    fatal_error = True # Don't retry immediately
                    break
                if "Geoblocked" in err_text:
                    last_err = "Source is geoblocked and cannot be accessed from this server."
                    fatal_error = True
                    break

                # Filter out non-fatal warnings that flood stderr
                lines = [l for l in err_text.splitlines() if "WARNING" not in l and "Deprecated" not in l]
                last_err = "\n".join(lines).strip() or "Unknown error (suppressed warnings)"
            
            if attempt < 2:
                import time
                time.sleep(2 ** attempt) # Exponential backoff: 1s, 2s

        if last_err:
            # Structuring the error for the UI
            error_type = "Access Denied" if "403" in last_err else "Network/Timeout"
            print(f"[{source_id}] yt-dlp FAILED ({error_type}): {last_err}. Attempting secondary discovery/fallback...")
            # We don't raise Exception here yet, we let glob/fallback try first

        # Find the downloaded file
        downloaded_files = glob.glob(f"{temp_audio}.*")
        if downloaded_files:
            audio_file_path = downloaded_files[0]
        else:
            # DIRECT DOWNLOAD FALLBACK
            # If yt-dlp fails but the URL is likely a direct audio link, try requests
            print(f"[{source_id}] yt-dlp produced no file. Trying direct download fallback...")
            try:
                import requests
                # Use browser-like headers for direct download too
                resp = requests.get(source_url, stream=True, timeout=30, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                })
                resp.raise_for_status()
                
                # Guess extension from content-type
                ext = "mp3"
                if "audio/mpeg" in resp.headers.get("Content-Type", ""): ext = "mp3"
                elif "audio/aac" in resp.headers.get("Content-Type", ""): ext = "aac"
                elif "audio/wav" in resp.headers.get("Content-Type", ""): ext = "wav"
                
                audio_file_path = f"{temp_audio}.{ext}"
                with open(audio_file_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"[{source_id}] Direct download SUCCESS: {audio_file_path}")
            except Exception as de:
                print(f"[{source_id}] Direct download FAILED: {de}")

    if not audio_file_path:
        raise Exception(f"Failed to locate or download audio for {source_id}")

    # Check filesize limit (OpenAI Whisper max 25MB)
    # Ensure pydub uses our local ffmpeg
    try:
        import imageio_ffmpeg
        os.environ["IMAGEIO_FFMPEG_EXE"] = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception: pass

    file_size_mb = os.path.getsize(audio_file_path) / (1024 * 1024)
    
    chunk_paths = []
    if file_size_mb > 24:
        # Slice natively using ffmpeg binary (avoids pydub's ffprobe dependency)
        try:
            import imageio_ffmpeg
            import subprocess
            import glob
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            
            print(f"[{source_id}] File is {file_size_mb:.1f}MB. Chunking via ffmpeg segmenting...")
            chunk_pattern = f"{audio_file_path}_chunk_%03d.mp3"
            
            # Split every 5 minutes (300 seconds) to guarantee <25MB and maximize parallelism
            cmd = [
                ffmpeg_exe, "-y", "-i", audio_file_path,
                "-f", "segment", "-segment_time", "300",
                "-c", "copy", chunk_pattern
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Gather chunks in order
            chunks = sorted(glob.glob(f"{audio_file_path}_chunk_*.mp3"))
            for i, ch_path in enumerate(chunks):
                chunk_paths.append((ch_path, i * 300.0))  # path, start_offset_seconds
                
        except Exception as e:
            raise Exception(f"Failed to split {file_size_mb:.1f}MB audio: {str(e)}")
    else:
        chunk_paths.append((audio_file_path, 0.0))

    # 2. Transcribe via OpenAI
    try:
        from openai import OpenAI
        client = OpenAI()
        transcript_list = []
        
        # Get normalized language from metadata if available to guide Whisper
        metadata = load_source_metadata(source_id)
        req_lang = metadata.get("language")

        import concurrent.futures

        def transcribe_chunk(chunk_info):
            ch_path, offset_sec = chunk_info
            
            last_ex = None
            for attempt in range(3): # Increase to 3
                try:
                    with open(ch_path, "rb") as f:
                        transcript = client.audio.transcriptions.create(
                            model="whisper-1",
                            file=f,
                            language=req_lang if req_lang and len(req_lang) == 2 else None,
                            response_format="verbose_json"
                        )
                    
                    # Format to list of segments
                    segments = transcript.segments if hasattr(transcript, "segments") else transcript.model_dump().get("segments", [])
                    if not segments:
                        text_val = transcript.text if hasattr(transcript, "text") else transcript.model_dump().get("text", "")
                        segments = [{"text": text_val, "start": 0.0, "end": float(len(text_val.split()) * 0.4)}] # rough guess
                        
                    chunk_segments = []
                    for seg in segments:
                        start = getattr(seg, "start", None)
                        if start is None and isinstance(seg, dict): start = seg.get("start", 0.0)
                        
                        end = getattr(seg, "end", None)
                        if end is None and isinstance(seg, dict): end = seg.get("end", 0.0)
                        
                        text = getattr(seg, "text", None)
                        if text is None and isinstance(seg, dict): text = seg.get("text", "")
                
                        chunk_segments.append({
                            "text": (text or "").strip(),
                            "start": float(start or 0.0) + offset_sec,
                            "duration": float(end or 0.0) - float(start or 0.0)
                        })
                    return chunk_segments
                except Exception as ex:
                    last_ex = ex
                    # If it's a rate limit or server error, wait longer
                    wait_time = 5 * (2 ** attempt) if "429" in str(ex) or "500" in str(ex) else 2
                    print(f"[{source_id}] Whisper chunk failed (attempt {attempt+1}): {ex}. Retrying in {wait_time}s...")
                    if attempt < 2:
                        import time
                        time.sleep(wait_time)
            
            raise last_ex

        # Increase workers for better parallelism on larger files (max_workers=16 for modern CPUs)
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
            # Map retains the original order
            results = list(executor.map(transcribe_chunk, chunk_paths))
            
        for chunk_segments in results:
            transcript_list.extend(chunk_segments)

    except Exception as e:
        raise Exception(f"OpenAI Whisper API failed: {str(e)}")
    finally:
        # Cleanup audio - DON'T remove if it's the original local source
        if not is_local_source:
            try: os.remove(audio_file_path)
            except: pass
        for ch_path, _ in chunk_paths:
            if ch_path != audio_file_path:
                try: os.remove(ch_path)
                except: pass

    json_path = os.path.join(output_dir, f"{source_id}_raw.json")
    txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transcript_list, f, indent=2)

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(" ".join(str(c.get("text", "")) for c in transcript_list))

    return {
        "source_id": source_id,
        "status": "success",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(transcript_list),
        "chunk_count": len(transcript_list),
    }




def fetch_rss_transcript_if_available(url: str) -> str:
    """Check RSS/URL for a pre-existing transcript link to avoid Whisper."""
    import urllib.request
    import re
    # Improved Headers to bypass common bot-blocking (403)
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    }
    
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            
        patterns = [
            r'<podcast:transcript[^>]*url=["\'](.*?)["\']',
            r'<transcript[^>]*url=["\'](.*?)["\']',
            r'<enclosure[^>]*url=["\'](.*?)["\'][^>]*type=["\']audio/',
            r'<enclosure[^>]*type=["\']audio/.*?["\'][^>]*url=["\'](.*?)["\']',
            r'<enclosure[^>]*type=["\']text/plain["\'][^>]*url=["\'](.*?)["\']',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                return match.group(1)
                
        return None
    except:
        return None


def fetch_rss_text_transcript(source_id: str, url: str, output_dir: str) -> dict:
    """
    Fetch text content for a non-podcast RSS/Blog source, 
    or a pre-existing transcript link discovered in RSS.
    """
    import urllib.request
    # Improved Headers to bypass common bot-blocking (403)
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8", errors="replace")

        # Basic logic: 
        # If it's code/XML, try to get <content:encoded> or <description>
        # If it's HTML, strip tags or just grab <p> contents.
        
        text = ""
        if "<?xml" in content or "<rss" in content:
            # RSS/XML
            item_match = re.search(r"<item>(.*?)</item>", content, re.DOTALL | re.IGNORECASE)
            item_xml = item_match.group(1) if item_match else content
            
            # 1. Try common content tags (including high-res content)
            content_m = re.search(r"<(?:content:encoded|description|body)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</(?:content:encoded|description|body)>", item_xml, re.DOTALL | re.IGNORECASE)
            text = content_m.group(1) if content_m else ""
            
            # 2. If text is suspiciously short for a podcast, it's likely just a summary, not a transcript
            # 2. If text is dangerously short, it's likely just a summary, not a transcript
            # We enforce a 500-character or 100-word threshold for "Rescue"
            word_count = len(text.split())
            char_count = len(text)
            if word_count < 100 or char_count < 500:
                print(f"[{source_id}] RSS text check: {word_count} words, {char_count} chars. Threshold not met (min 100/500). Skipping Fast-Path.")
                return None
        else:
            # HTML - very naive para extraction
            paras = re.findall(r"<p[^>]*>(.*?)</p>", content, re.DOTALL | re.IGNORECASE)
            text = "\n\n".join(re.sub(r"<[^>]+>", "", p) for p in paras if p.strip()) if paras else ""
            
            # If text is short, try to rescue from meta description (Essential for X/Twitter)
            if len(text.split()) < 50:
                 # Try og:description or twitter:description
                 meta_m = re.search(r'<meta\s+(?:property|name)="(?:og|twitter):description"\s+content="(.*?)"', content, re.IGNORECASE)
                 if meta_m:
                     text = meta_m.group(1).strip()
                     print(f"[{source_id}] Content rescue via Meta Description: {text[:50]}...")
            
            if len(text.split()) < 10: # Still too short
                 return None

        # Strip remaining HTML tags
        text = re.sub(r"<[^>]+>", "", text).strip()

        transcript_list = [{"text": text, "start": 0.0, "duration": 0.0}]
        
        json_path = os.path.join(output_dir, f"{source_id}_raw.json")
        txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(transcript_list, f, indent=2)
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(text)

        return {
            "source_id": source_id,
            "status": "success",
            "json_path": json_path,
            "text_path": txt_path,
            "segment_count": 1,
            "chunk_count": 1,
        }
    except Exception as e:
        raise Exception(f"Failed to fetch RSS text: {str(e)}")


def finish_transcript(source_id: str, transcript_list: list, output_dir: str) -> dict:
    """Helper to save transcript files and return success status."""
    json_path = os.path.join(output_dir, f"{source_id}_raw.json")
    txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transcript_list, f, indent=2)

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(" ".join(str(c.get("text", "")) for c in transcript_list))

    return {
        "source_id": source_id,
        "status": "success",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(transcript_list),
        "chunk_count": len(transcript_list),
    }


def fetch_transcript(source_id: str, source_url: str = None, source_type: str = None, max_segments: int = 100):
    """Main entrypoint — dispatch to correct fetcher based on source type."""
    base = os.path.dirname(__file__)

    # Load metadata if not provided
    print(f"[{source_id}] HARVESTER START | URL: {source_url} | Type: {source_type}")
    metadata = {}
    if not source_type or not source_url:
        metadata = load_source_metadata(source_id)
        
        # If metadata is just the default fallback, try to infer from URL/ID
        if metadata.get("source_type") == "youtube" and not metadata.get("url"):
            if "vimeo.com" in (source_url or "") or source_id.startswith("vimeo_"):
                source_type = "vimeo"
            elif "spotify.com" in (source_url or "") or source_id.startswith("podcast_"):
                source_type = "podcast"
            elif source_url and (source_url.endswith(".xml") or "rss" in source_url):
                source_type = "rss"
            elif source_url and ("medium.com" in source_url or "substack.com" in source_url):
                source_type = "rss"
        
        source_type = source_type or metadata.get("source_type", "youtube")

        
        # Build fallback URL only if missing
        if not source_url:
            source_url = metadata.get("url")
            if not source_url:
                if source_type == "vimeo":
                    v_id = source_id.replace("vimeo_", "")
                    source_url = f"https://vimeo.com/{v_id}"
                elif source_type == "youtube":
                    source_url = f"https://youtube.com/watch?v={source_id}"
                else:
                    source_url = source_id # Hope it's a URL

    referer = metadata.get("referer")
    
    # Update metadata with resolved type for strategy determination
    metadata["source_type"] = source_type
    metadata["url"] = source_url
    
    # 1. NEW: Determine Strategy
    strategy, method = determine_transcript_strategy(source_id, metadata)
    print(f"[{source_id}] Strategy: {strategy} | Method: {method}")
    
    # Update metadata with strategy and attempt count
    metadata["transcript_strategy"] = strategy
    metadata["transcript_source"] = method
    metadata["fetch_attempt_count"] = metadata.get("fetch_attempt_count", 0) + 1
    metadata["last_fetch_attempt_at"] = datetime.datetime.now().isoformat()
    
    # Save the updated metadata back to disc
    # (In a real system we'd use the adapter.save, but here we just update .tmp/sources/)
    meta_path = os.path.join(base, ".tmp", "sources", f"{source_id}.json")
    if os.path.exists(meta_path):
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump([metadata], f, indent=2)

    if strategy == "unavailable":
        # Final Rescue: check if metadata already has the full text (from RssAdapter or Podcast description rescue)
        rescued = metadata.get("raw_metadata", {}).get("extracted_text_preview") or \
                  metadata.get("raw_metadata", {}).get("rescued_article_text") or \
                  (metadata.get("description") if len(metadata.get("description", "")) > 300 else None)
        
        # Spotify Specific Rescue
        if not rescued and "spotify.com" in source_url:
             print(f"[{source_id}] SPOTIFY: Audio fails frequently. Attempting description rescue...")
             # yt-dlp might have gotten the description even if audio failed
             rescued = metadata.get("description")

        if rescued:
            print(f"[{source_id}] RESCUE: Using metadata text as transcript fallback.")
            output_dir = os.path.join(base, ".tmp", "transcripts", source_id)
            os.makedirs(output_dir, exist_ok=True)
            result = finish_transcript(source_id, [{"text": rescued, "start": 0.0, "duration": 0.0}], output_dir)
            result["status"] = "rescued_text"
            print(json.dumps(result))
            return

        raise Exception(f"Transcript unavailable for this source. Route: {method}")


    # Determine the actual YouTube ID for YouTube sources
    yt_id = source_id
    if source_type == "youtube":
        yt_id = extract_video_id(source_url) if source_url else source_id
        if not yt_id or len(yt_id) > 20:
            yt_id = source_id

    output_dir = os.path.join(base, ".tmp", "transcripts", source_id)
    os.makedirs(output_dir, exist_ok=True)

    # 1. FAST-PATH: Check for pre-existing transcript links in RSS/HTML for ANY source
    # This avoids Whisper/YouTube API if a direct link is already provided in metadata or via discovery
    fast_path_url = fetch_rss_transcript_if_available(source_url)
    if fast_path_url:
        print(f"[{source_id}] FAST-PATH: Found direct transcript link: {fast_path_url}")
        try:
            result = fetch_rss_text_transcript(source_id, fast_path_url, output_dir)
            if result:
                print(json.dumps(result))
                return
        except Exception as fe:
            print(f"[{source_id}] FAST-PATH failed: {fe}. Falling back to standard strategy.")

    try:
        if source_type == "youtube":
            result = fetch_youtube_transcript(yt_id, output_dir, max_segments=max_segments)
            result["source_id"] = source_id
            print(json.dumps(result))

        elif source_type in ("podcast", "upload", "vimeo", "recording", "apple_podcast", "spotify"):
            try:
                result = fetch_whisper_transcript(source_id, source_url, output_dir, referer=referer)
                print(json.dumps(result))
            except Exception as e:
                # Rescue for podcasts if audio fails but we have metadata text
                rescued = metadata.get("raw_metadata", {}).get("rescued_article_text") or \
                          metadata.get("raw_metadata", {}).get("extracted_text_preview")
                
                # Spotify Specific: If it's Spotify and we failed, try the description
                if not rescued and "spotify.com" in source_url:
                    descr = metadata.get("description")
                    if descr and len(descr) > 100: # Lowered threshold
                         rescued = descr
                         print(f"[{source_id}] SPOTIFY RESCUE: Audio failed, using episode description.")
                
                if not rescued:
                    # Final fallback for Spotify: use title and a placeholder if needed
                    # "we have grown pass this" implies it should never just fail
                    title = metadata.get("title", "Unknown Episode")
                    rescued = f"Transcription unavailable for '{title}'.\n\nShow Notes: {metadata.get('description', 'No description available.')}"
                    print(f"[{source_id}] FINAL RESCUE: Using placeholder text.")

                if rescued:
                    print(f"[{source_id}] RESCUE: Audio failed, falling back to show notes.", file=sys.stderr)
                    result = finish_transcript(source_id, [{"text": rescued, "start": 0.0, "duration": 0.0}], output_dir)
                    result["status"] = "rescued_text"
                    print(json.dumps(result))
                else:
                    raise e


        elif source_type in ("rss", "twitter", "document"):
            # 1. Check if metadata already has extracted text preview
            rescued = metadata.get("raw_metadata", {}).get("extracted_text_preview") or \
                      metadata.get("raw_metadata", {}).get("rescued_article_text") or \
                      metadata.get("description") # Fallback to description if unroll failed
            
            if rescued and len(rescued) > 50:
                result = finish_transcript(source_id, [{"text": rescued, "start": 0.0, "duration": 0.0}], output_dir)
                print(json.dumps(result))
            else:
                if source_type == "rss":
                    result = fetch_rss_text_transcript(source_id, source_url, output_dir)
                    if result:
                        print(json.dumps(result))
                        return
                
                raise Exception(f"{source_type.title()} content contains no usable transcript.")


        else:
            raise Exception(f"Unsupported source type: {source_type}")

    except Exception as e:
        error_str = str(e)
        # Log to stderr and exit with non-zero to trigger hard gate in UI
        print(json.dumps({
            "source_id": source_id, 
            "status": "error", 
            "error_detail": error_str,
            "transcript_status": "unavailable"
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch transcript for any source type.")
    parser.add_argument("--url", help="Source URL (YouTube, Vimeo, podcast, etc.)")
    parser.add_argument("--source-id", help="Normalized source ID")
    parser.add_argument("--source-type", default=None, help="Source type override")
    parser.add_argument("--max-segments", type=int, default=100, help="Max segments to merge into")
    args = parser.parse_args()

    # Resolve source_id from URL if not provided
    source_id = args.source_id
    if not source_id and args.url:
        source_id = extract_video_id(args.url)

    if not source_id:
        print(json.dumps({"status": "error", "error_detail": "Must provide --url or --source-id"}), file=sys.stderr)
        sys.exit(1)

    fetch_transcript(source_id, args.url, args.source_type, max_segments=args.max_segments)
