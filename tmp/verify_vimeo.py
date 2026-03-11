import sys
import os

# Add execution directory to path so we can import adapters
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "execution")))

from adapters.vimeo_adapter import VimeoAdapter

adapter = VimeoAdapter()
url = "https://vimeo.com/60761171"
print(f"Testing URL: {url}")

normalized = adapter.normalize(url)
print(f"Source ID: {normalized.source_id}")
print(f"Source Type: {normalized.source_type}")
print(f"Title: {normalized.title}")
print(f"Thumbnail: {normalized.thumbnail}")
print(f"URL: {normalized.url}")

if "player.vimeo.com/video/" in normalized.url:
    print("SUCCESS: Normalized to player URL.")
else:
    print("FAILURE: Did not normalize correctly.")
