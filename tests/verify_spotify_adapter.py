from execution.adapters.podcast_adapter import PodcastAdapter
import asyncio
import json

async def test_spotify_resolution():
    adapter = PodcastAdapter()
    url = "https://open.spotify.com/episode/1Jh8pos23eTO9uFiBMlUxt"
    source_id = "spotify_1Jh8pos23eTO9uFiBMlUxt"
    
    print(f"Testing resolution for {url}...")
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        html_content = response.read().decode('utf-8')
    print(f"HTML Preview:\n{html_content[:1500]}")
    
    result = adapter.normalize(url, source_id)
    print("--- Resolution Result ---")
    print(f"Title: {result.title}")
    print(f"Creator (Show Name): {result.creator}")
    print(f"Transcript Status: {result.transcript_status}")
    print(f"Show Name in Meta: {result.raw_metadata.get('show_name')}")
    print(f"Description Length: {len(result.description)}")

if __name__ == "__main__":
    asyncio.run(test_spotify_resolution())
