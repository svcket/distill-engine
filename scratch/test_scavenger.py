import subprocess
import re

def test_search(title, creator_name):
    # The logic we just implemented
    clean_title = re.sub(r'\[.*?\]|\(.*?\)', '', title).strip()
    # Try a more aggressive clean: strip everything after | or -
    stale_clean = re.split(r'\||-', clean_title)[0].strip()
    
    queries = [
        f'"{clean_title}" {creator_name} podcast full',
        f'"{stale_clean}" {creator_name} podcast',
        f'"{stale_clean}" podcast full'
    ]
    
    for q in queries:
        print(f"Testing Query: {q}")
        cmd = ["yt-dlp", "--get-id", "--quiet", "--no-playlist", f"ytsearch1:{q}"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        vid_id = res.stdout.strip()
        print(f"Result: {vid_id}\n")

if __name__ == "__main__":
    title = '"We have 900 days left." | Emad Mostaque'
    creator = "Emad Mostaque"
    test_search(title, creator)
