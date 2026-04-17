import os
import sys
import json
import time
import requests
from typing import Optional, Dict, Any, List

class ScavengerHub:
    """
    Universal Scavenger Hub — The intelligence layer for recovering content from 
    restricted sources using Apify Actors as high-fidelity proxies.
    """
    def __init__(self):
        self.api_token = os.environ.get("APIFY_TOKEN")
        self.api_base = "https://api.apify.com/v2"

    def is_available(self) -> bool:
        return bool(self.api_token)

    def _run_actor(self, actor_id: str, input_data: Dict[str, Any], timeout: int = 180) -> Optional[List[Dict[str, Any]]]:
        """
        Executes an Apify Actor and waits for the results.
        """
        if not self.api_token:
            return None

        actor_id_escaped = actor_id.replace("/", "~")
        url = f"{self.api_base}/acts/{actor_id_escaped}/run-sync-get-dataset-items?token={self.api_token}&timeout={timeout}"
        
        try:
            print(f"[ScavengerHub] Triggering Heavy Artillery (Actor: {actor_id})...", file=sys.stderr)
            response = requests.post(url, json=input_data, timeout=timeout + 10)
            
            if response.status_code == 201 or response.status_code == 200:
                return response.json()
            else:
                print(f"[ScavengerHub] Actor failed (Status: {response.status_code}): {response.text}", file=sys.stderr)
                return None
        except Exception as e:
            print(f"[ScavengerHub] API Error: {str(e)}", file=sys.stderr)
            return None

    def scavenge_youtube_transcript(self, video_url: str) -> Optional[List[Dict[str, Any]]]:
        """
        Recovers a YouTube transcript using apify/youtube-scraper.
        """
        # Optimized YouTube Scraper payload specifically for HIGH FIDELITY transcripts
        actor_input = {
            "downloadSubtitles": True,
            "saveSubsAsTranscript": True,
            "startUrls": [{"url": video_url}],
            "maxResults": 1,
            "subtitlesFormat": "srt",
            "subtitlesLanguage": "en",
            "proxyConfiguration": {"useApifyProxy": True}
        }
        
        # Note: apify/youtube-scraper is a complex actor. 
        # For transcripts, we might prefer a more specialized one or ensure settings are right.
        results = self._run_actor("streamers/youtube-scraper", actor_input)
        
        if results and len(results) > 0:
            video_data = results[0]
            # Apify youtube-scraper often returns subtitles in a specific format
            subtitles = video_data.get("subtitles", [])
            if subtitles:
                # Transform to a single flattened string for high-fidelity ingestion
                # Each subtitle entry usually has a 'text' field.
                flat_text = " ".join([s.get("text", "") for s in subtitles]).strip()
                
                if flat_text:
                    print(f"[ScavengerHub] Recovered {len(subtitles)} subtitle entries ({len(flat_text)} chars).", file=sys.stderr)
                    # Hallucination Shield: Prepend origin tag
                    return f"[CLOUD RESCUE] {flat_text}"
        return None

    def scavenge_website_content(self, url: str) -> Optional[str]:
        """
        Extracts clean text/markdown from any website using apify/website-content-crawler.
        """
        actor_input = {
            "startUrls": [{"url": url}],
            "maxCrawlPages": 1,
            "proxyConfiguration": {"useApifyProxy": True}
        }
        
        results = self._run_actor("apify/website-content-crawler", actor_input)
        
        if results and len(results) > 0:
            page_data = results[0]
            return page_data.get("markdown") or page_data.get("text")
        return None

    def scavenge_spotify_podcast(self, spotify_url: str) -> Optional[Dict[str, Any]]:
        """
        Extracts podcast metadata/mirrors using a Spotify scraper.
        """
        # Placeholder for specific Spotify actor logic
        # actor_id = "microworlds/spotify-scraper"
        return None

    def scavenge_metadata(self, source_type: str, url: str) -> Optional[Dict[str, Any]]:
        """
        Unmasks metadata (title, creator, description) for a restricted source.
        """
        if source_type == "youtube":
            actor_input = {"startUrls": [{"url": url}], "maxResults": 1}
            results = self._run_actor("streamers/youtube-scraper", actor_input)
            if results and len(results) > 0:
                v = results[0]
                return {
                    "title": v.get("title"),
                    "creator": v.get("channelName") or v.get("ownerName"),
                    "description": v.get("description")
                }
        elif source_type in ("rss", "document", "website"):
            actor_input = {"startUrls": [{"url": url}], "maxCrawlPages": 1}
            results = self._run_actor("apify/website-content-crawler", actor_input)
            if results and len(results) > 0:
                p = results[0]
                return {
                    "title": p.get("metadata", {}).get("title") or p.get("title"),
                    "description": p.get("metadata", {}).get("description"),
                    "creator": p.get("metadata", {}).get("author")
                }
        return None

def trigger_scavenger_rescue(source_type: str, url: str, mode: str = "transcript") -> Optional[Any]:
    """
    Convenience wrapper for the Scavenger Hub.
    Modes: transcript | metadata
    """
    hub = ScavengerHub()
    if not hub.is_available():
        return None
        
    if mode == "metadata":
        return hub.scavenge_metadata(source_type, url)

    if source_type == "youtube":
        return hub.scavenge_youtube_transcript(url)
    elif source_type in ("rss", "document", "website"):
        return hub.scavenge_website_content(url)
    
    return None

if __name__ == "__main__":
    # Internal Test
    if len(sys.argv) > 2:
        res = trigger_scavenger_rescue(sys.argv[1], sys.argv[2])
        print(json.dumps(res))

# Build cache buster: Sun Apr 12 11:58:12 WAT 2026

# Build cache buster: Sun Apr 12 12:05:12 WAT 2026

# Build cache buster: Sun Apr 12 12:12:42 WAT 2026

# Build cache buster: Sun Apr 12 12:22:56 WAT 2026

# Build cache buster: Sun Apr 12 12:43:56 WAT 2026
