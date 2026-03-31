
import requests
import re
import json

url = "https://open.spotify.com/episode/6tGxT0Z9gPWtmMpGl784CN"
embed_url = url.replace("open.spotify.com/episode/", "open.spotify.com/embed/episode/").split("?")[0]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

for target in [url, embed_url]:
    print(f"\nTargeting: {target}")
    try:
        resp = requests.get(target, headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        html = resp.text
        
        # Check for og:title
        og_match = re.search(r'property="og:title" content="(.*?)"', html)
        if og_match:
            print(f"Found og:title: {og_match.group(1)}")
        
        # Check for twitter:title
        tw_match = re.search(r'name="twitter:title" content="(.*?)"', html)
        if tw_match:
            print(f"Found twitter:title: {tw_match.group(1)}")
            
        # Check for any JSON-LD
        schema_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        if schema_match:
            print("Found ld+json")
            try:
                data = json.loads(schema_match.group(1))
                print(f"Name in schema: {data.get('name')}")
            except: pass

        # Check for "entity" JSON in Spotify's internal data script
        entity_match = re.search(r'id="initial-state"[^>]*>(.*?)<', html, re.DOTALL)
        if entity_match:
             print("Found initial-state script")
             # This is usually base64 encoded or just raw JSON
             # Let's see if we can find the title substring
             if "Claude" in entity_match.group(1):
                 print("Found 'Claude' in initial-state!")

    except Exception as e:
        print(f"Error: {e}")
