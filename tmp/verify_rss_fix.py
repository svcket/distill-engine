import sys
import os

# Add execution directory to path so we can import adapters
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "execution")))

from adapters.podcast_adapter import PodcastAdapter

adapter = PodcastAdapter()
url = "https://rss.com/podcasts/ww3podcast/362191/"
print(f"Testing URL: {url}")

normalized = adapter.normalize(url)
print(f"Source ID: {normalized.source_id}")
print(f"Source Type: {normalized.source_type}")
print(f"Title: {normalized.title}")
print(f"MP3 URL: {normalized.url}")

if normalized.url != url and (".mp3" in normalized.url or ".m4a" in normalized.url):
    print("SUCCESS: Resolved to direct audio URL.")
else:
    print("FAILURE: Did not resolve to direct audio URL.")
