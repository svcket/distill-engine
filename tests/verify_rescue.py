import sys
import os

# Add current dir to path to import adapters
sys.path.append(os.getcwd())

from execution.adapters.podcast_adapter import PodcastAdapter

def test_apple_podcast_resolution():
    adapter = PodcastAdapter()
    url = "https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1414462524"
    print(f"Testing URL resolution for: {url}")
    
    # Call normalize (which replaces extract_metadata)
    normalized = adapter.normalize(url, shell=False)
    
    print(f"Metadata extracted: {normalized.title} by {normalized.creator}")
    print(f"Status: {normalized.transcript_status}")
    print(f"Strategy: {normalized.transcript_strategy}")
    
    if normalized.transcript_status == "rescued_text":
        print("SUCCESS: Metadata Rescue found transcript text!")
    elif normalized.url != url:
        print(f"SUCCESS: MP3 URL resolved to: {normalized.url}")
    else:
        print("INFO: No rescued text or MP3 found, but normalization completed.")

if __name__ == "__main__":
    test_apple_podcast_resolution()
