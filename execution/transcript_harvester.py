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

    # 1. Try exact source metadata file first (Most detailed)
    direct = os.path.join(base, ".tmp", "sources", f"{source_id}.json")
    if os.path.exists(direct):
        try:
            with open(direct, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data[0] if isinstance(data, list) and data else data
        except Exception:
            pass

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

    is_platform_url = ("spotify.com" in source_url and "spotify.com" in source_id) or \
                      ("podcasts.apple.com" in source_url and "podcasts.apple.com" in source_id)
                      
    if is_platform_url:
        # We only block if the URL being passed to yt-dlp is STILL a platform-guarded URL.
        # If it was resolved to a direct MP3/CDN link by the adapter, we should proceed.
        raise Exception(
            "This platform isolates audio using DRM protection or proprietary players. "
            "Distill could not automatically resolve the public RSS feed for this episode. "
            "Please provide the direct RSS Feed link or an MP3 URL to fetch this transcript."
        )

    temp_audio = os.path.join(output_dir, f"{source_id}_audio")
    cmd = [
        "python3", "-m", "yt_dlp",
        "--force-overwrites",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "6", # Speed over quality: 0 (best) - 9 (worst). 6 is a good balance for transcription size.
        "-f", "bestaudio/worst", 
        "-o", f"{temp_audio}.%(ext)s"
    ]
    if ffmpeg_exe:
        cmd.extend(["--ffmpeg-location", ffmpeg_exe])

    if referer:
        cmd.extend(["--referer", referer])
    cmd.append(source_url)
    
    try:
        # Use a 120s timeout to prevent hanging on slow streams
        proc = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    except subprocess.TimeoutExpired:
        raise Exception("Download timed out after 120s. The source might be too slow or inaccessible.")
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr.decode() if e.stderr else "Unknown yt-dlp error"
        raise Exception(f"Failed to download audio via yt-dlp: {err_msg}")

    # Find the downloaded file
    downloaded_files = glob.glob(f"{temp_audio}.*")
    if not downloaded_files:
        raise Exception(f"Failed to locate downloaded audio for {source_id}")
    audio_file_path = downloaded_files[0]

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
            
            # Split every 10 minutes (600 seconds) to guarantee <25MB even for 320kbps MP3s
            cmd = [
                ffmpeg_exe, "-y", "-i", audio_file_path,
                "-f", "segment", "-segment_time", "600",
                "-c", "copy", chunk_pattern
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Gather chunks in order
            chunks = sorted(glob.glob(f"{audio_file_path}_chunk_*.mp3"))
            for i, ch_path in enumerate(chunks):
                chunk_paths.append((ch_path, i * 600.0))  # path, start_offset_seconds
                
        except Exception as e:
            raise Exception(f"Failed to split {file_size_mb:.1f}MB audio: {str(e)}")
    else:
        chunk_paths.append((audio_file_path, 0.0))

    # 2. Transcribe via OpenAI
    try:
        from openai import OpenAI
        client = OpenAI()
        transcript_list = []
        
        import concurrent.futures

        def transcribe_chunk(chunk_info):
            ch_path, offset_sec = chunk_info
            with open(ch_path, "rb") as f:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
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

        # Increase workers for better parallelism on larger files
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            # Map retains the original order
            results = list(executor.map(transcribe_chunk, chunk_paths))
            
        for chunk_segments in results:
            transcript_list.extend(chunk_segments)

    except Exception as e:
        raise Exception(f"OpenAI Whisper API failed: {str(e)}")
    finally:
        # Cleanup audio
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


def make_mock_transcript(source_id: str, output_dir: str, reason: str = "") -> dict:
    """Fallback mock transcript when real fetch fails."""
    mock = [
        {"text": f"Mock transcript for source {source_id}.", "start": 0.0, "duration": 5.0},
        {"text": reason or "The transcript could not be retrieved for this source.", "start": 5.0, "duration": 5.0},
        {"text": "The pipeline execution layer is working correctly.", "start": 10.0, "duration": 4.0},
    ]
    json_path = os.path.join(output_dir, f"{source_id}_raw.json")
    txt_path = os.path.join(output_dir, f"{source_id}_raw.txt")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(mock, f, indent=2)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(" ".join(c["text"] for c in mock))

    return {
        "source_id": source_id,

        "status": "success_mocked",
        "json_path": json_path,
        "text_path": txt_path,
        "segment_count": len(mock),
        "chunk_count": len(mock),
        "note": f"Mock transcript served. Reason: {reason or 'unknown'}",
    }


def fetch_rss_transcript_if_available(url: str) -> str:
    """Check RSS/URL for a pre-existing transcript link to avoid Whisper."""
    import urllib.request
    import re
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            
        # Look for transcript links in common RSS tags
        # <podcast:transcript url="..." /> or similar patterns
        patterns = [
            r'<podcast:transcript[^>]*url=["\'](.*?)["\']',
            r'<transcript[^>]*url=["\'](.*?)["\']',
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
            
            content_m = re.search(r"<(?:content:encoded|description)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</(?:content:encoded|description)>", item_xml, re.DOTALL | re.IGNORECASE)
            text = content_m.group(1) if content_m else "No text content found in RSS item."
        else:
            # HTML - very naive para extraction
            paras = re.findall(r"<p[^>]*>(.*?)</p>", content, re.DOTALL | re.IGNORECASE)
            text = "\n\n".join(paras) if paras else "No readable paragraphs found in URL."

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
        return make_mock_transcript(source_id, output_dir, f"Failed to fetch RSS text: {str(e)}")


def fetch_transcript(source_id: str, source_url: str = None, source_type: str = None):
    """Main entrypoint — dispatch to correct fetcher based on source type."""
    base = os.path.dirname(__file__)

    # Load metadata if not provided
    metadata = {}
    if not source_type or not source_url:
        metadata = load_source_metadata(source_id)
        source_type = source_type or metadata.get("source_type", "youtube")
        source_url = source_url or metadata.get("url", f"https://youtube.com/watch?v={source_id}")

    referer = metadata.get("referer")

    # Determine the actual YouTube ID for YouTube sources
    yt_id = source_id
    if source_type == "youtube":
        yt_id = extract_video_id(source_url) if source_url else source_id
        if not yt_id or len(yt_id) > 20:
            yt_id = source_id

    output_dir = os.path.join(base, ".tmp", "transcripts", source_id)
    os.makedirs(output_dir, exist_ok=True)

    try:
        if source_type == "youtube":
            result = fetch_youtube_transcript(yt_id, output_dir)
            # Normalise source_id reference in result
            result["source_id"] = source_id

            print(json.dumps(result))

        elif source_type in ("podcast", "upload", "vimeo"):
            result = fetch_whisper_transcript(source_id, source_url, output_dir, referer=referer)
            print(json.dumps(result))

        elif source_type == "rss":
            # 1. Check if it's a podcast RSS with an embedded transcript link
            transcript_url = fetch_rss_transcript_if_available(source_url)
            if transcript_url:
                result = fetch_rss_text_transcript(source_id, transcript_url, output_dir)
            else:
                # 2. Treat as blog text
                result = fetch_rss_text_transcript(source_id, source_url, output_dir)
            print(json.dumps(result))

        else:
            result = make_mock_transcript(source_id, output_dir, f"Unsupported source type: {source_type}")
            print(json.dumps(result))

    except Exception as e:
        error_str = str(e)
        recoverable = any(x in error_str.lower() for x in [
            "couldnotretrievetranscript", "transcriptsdisabled",
            "videounavailable", "notranscriptfound",
            "failed to resolve", "nodename nor servname", "max retries",
            "drm", "unsupported", "logged-in", "private", "requires authentication",
            "http error"
        ])
        if recoverable or "mock_" in source_id or "src_" in source_id:
            result = make_mock_transcript(source_id, output_dir, error_str[:120])
            print(json.dumps(result))
        else:
            print(json.dumps({"source_id": source_id, "status": "error", "error_detail": error_str}), file=sys.stderr)
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
