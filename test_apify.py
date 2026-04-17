import sys
import os
import json

app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(app_dir)

from execution.scavenger_hub import ScavengerHub

# Mock a restricted video or use any youtube
url = 'https://www.youtube.com/watch?v=kY2hE3vA4T0' # Random video

from dotenv import load_dotenv
load_dotenv(".env")
print("ENV", os.environ.get("APIFY_TOKEN"))

hub = ScavengerHub()
print("Token:", bool(hub.api_token))

actor_input = {
    "downloadSubtitles": True,
    "saveSubsAsTranscript": True,
    "startUrls": [{"url": url}],
    "maxResults": 1,
    "subtitlesFormat": "srt",
    "subtitlesLanguage": "en",
    "proxyConfiguration": {"useApifyProxy": True}
}

res = hub._run_actor("streamers~youtube-scraper", actor_input, timeout=180)
if res:
    keys = res[0].keys() if len(res)>0 and isinstance(res[0], dict) else []
    print("KEYS:", list(keys))
    # print the subtitles key
    if len(res)>0 and isinstance(res[0], dict):
        subs = res[0].get("subtitles")
        print("SUBTITLES TYPE:", type(subs))
        if isinstance(subs, list):
            print("LEN:", len(subs))
            if len(subs) > 0:
                print("FIRST SUB:", str(subs[0])[:100])
        elif isinstance(subs, str):
            print("LEN: STR", len(subs))
            print("FIRST SUB:", subs[:100])
    
