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
    if source_type == "podcast" or "spotify.com" in url or "podcasts.apple.com" in url or "rss.com" in url:
        # If it's a known platform, we'll try Whisper strategy even without explicit .mp3
        # (yt-dlp handles many of these platform URLs natively)
        if "spotify.com" in url or "apple.com" in url or "rss.com" in url:
            return "audio_fallback", "audio_whisper"
        
        # Fallback check for direct audio extensions
        if any(ext in url.lower() for ext in [".mp3", ".m4a", ".wav", ".aac", ".ogg"]):
            return "audio_fallback", "audio_whisper"
            
        return "audio_fallback", "audio_whisper" # Try it anyway if typed as podcast

    # 4. RSS: Use normalized text pathway
    if source_type == "rss":
        return "normalized_text", "rss_content"

    # 5. Uploads / Recordings: Direct audio fallback
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


def fetch_youtube_transcript(source_id: str, output_dir: str) -> dict:
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

    json_path = os.path.join(output_dir, f"{source_id}_raw.json")
    txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transcript_list, f, indent=2)

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(" ".join(c["text"] for c in transcript_list))

    return {
        "source_id": source_id,
        "status": "success",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(transcript_list),
        "chunk_count": len(transcript_list),
    }


def fetch_whisper_transcript(source_id: str, source_url: str, output_dir: str, referer: str = None) -> dict:
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

    # 1. NEW: Check if the URL is actually a local file (e.g. from RecordingAdapter)
    # MOVE this to top to avoid yt-dlp/subtitle logic for local files
    audio_file_path = None
    if os.path.exists(source_url) and os.path.isfile(source_url):
        print(f"[{source_id}] Source is a local file: {source_url}. Skipping download logic.")
        audio_file_path = source_url
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
        if "vimeo.com" in source_url and "/video/" not in source_url and "player.vimeo.com" not in source_url:
            v_id = extract_video_id(source_url)
            if v_id:
                source_url = f"https://player.vimeo.com/video/{v_id}"

        sub_cmd = [
            "python3", "-m", "yt_dlp",
            "--skip-download",
            "--no-check-certificates",
            "--prefer-free-formats",
            "--no-warnings",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "--add-header", "Referer:https://vimeo.com/",
            "--write-subs",
            "--sub-langs", "en.*,.*-en.*",
            "--sub-format", "vtt/srt/best",
            "-o", sub_path_template,
            source_url
        ]
        
        try:
            subprocess.run(sub_cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
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
    
    if not audio_file_path: # Only attempt download if not already a local file
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
        elif "spotify.com" in source_url:
            cmd.extend(["--referer", "https://open.spotify.com/"])
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
            print(f"[{source_id}] yt-dlp FAILED: {last_err}")
            raise Exception(last_err)

        # Find the downloaded file
        downloaded_files = glob.glob(f"{temp_audio}.*")
        if downloaded_files:
            audio_file_path = downloaded_files[0]

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
        f.write(" ".join(c["text"] for c in transcript_list))

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
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
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
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
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
            if len(text.split()) < 100:
                print(f"[{source_id}] RSS text is too short ({len(text.split())} words). Likely a summary. Skipping Fast-Path.")
                return None
        else:
            # HTML - very naive para extraction
            paras = re.findall(r"<p[^>]*>(.*?)</p>", content, re.DOTALL | re.IGNORECASE)
            text = "\n\n".join(paras) if paras else ""
            
            if len(text.split()) < 50:
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
        f.write(" ".join(c["text"] for c in transcript_list))

    return {
        "source_id": source_id,
        "status": "success",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(transcript_list),
        "chunk_count": len(transcript_list),
    }


def fetch_transcript(source_id: str, source_url: str = None, source_type: str = None):
    """Main entrypoint — dispatch to correct fetcher based on source type."""
    base = os.path.dirname(__file__)

    # Load metadata if not provided
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
            result = fetch_youtube_transcript(yt_id, output_dir)
            result["source_id"] = source_id
            print(json.dumps(result))

        elif source_type in ("podcast", "upload", "vimeo", "recording"):
            result = fetch_whisper_transcript(source_id, source_url, output_dir, referer=referer)
            print(json.dumps(result))

        elif source_type == "rss":
            # If we reached here, the Fast-Path check above didn't return (or failed)
            # We try one more time with the base URL as the content source
            result = fetch_rss_text_transcript(source_id, source_url, output_dir)
            
            if result:
                print(json.dumps(result))
            else:
                raise Exception("RSS content contains no usable transcript.")

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
    args = parser.parse_args()

    # Resolve source_id from URL if not provided
    source_id = args.source_id
    if not source_id and args.url:
        source_id = extract_video_id(args.url)

    if not source_id:
        print(json.dumps({"status": "error", "error_detail": "Must provide --url or --source-id"}), file=sys.stderr)
        sys.exit(1)

    fetch_transcript(source_id, args.url, args.source_type)
