
import urllib.request
import re
import html

url = "https://open.spotify.com/episode/6tGxT0Z9gPWtmMpGl784CN"
embed_url = url.replace("open.spotify.com/episode/", "open.spotify.com/embed/episode/").split("?")[0]
user_agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

for target in [url, embed_url]:
    print(f"\nTargeting: {target}")
    for ua in user_agents:
        print(f"Trying UA: {ua}")
        try:
            req = urllib.request.Request(target, headers={
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                page_html = resp.read().decode("utf-8", errors="ignore")
                
                # Check for og:title
                og_title = re.search(r'property="og:title" content="(.*?)"', page_html)
                if og_title:
                    print(f"Found og:title: {og_title.group(1)}")
                
                # Check for twitter:title
                twitter_title = re.search(r'name="twitter:title" content="(.*?)"', page_html)
                if twitter_title:
                    print(f"Found twitter:title: {twitter_title.group(1)}")

                title_tag = re.search(r"<title>(.*?)</title>", page_html)
                if title_tag:
                    print(f"Found <title>: {title_tag.group(1)}")
                
                # Check for ld+json
                schema_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', page_html, re.DOTALL)
                if schema_match:
                    print("Found ld+json")
                    import json
                    try:
                        schema_data = json.loads(schema_match.group(1))
                        if isinstance(schema_data, dict):
                            print(f"Schema name: {schema_data.get('name')}")
                            print(f"Schema description: {schema_data.get('description')}")
                    except:
                        print("Failed to parse JSON")
        except Exception as e:
            print(f"Error: {e}")
