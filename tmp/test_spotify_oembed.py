
import urllib.request
import json
import urllib.parse

url = "https://open.spotify.com/episode/6tGxT0Z9gPWtmMpGl784CN"
oembed_url = f"https://open.spotify.com/oembed?url={urllib.parse.quote(url)}"

print(f"Testing OEmbed: {oembed_url}")

try:
    req = urllib.request.Request(oembed_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
