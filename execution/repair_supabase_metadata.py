import os
import json
import requests
import re
from openai import OpenAI
from dotenv import load_dotenv

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    exit(1)

def recover_title_from_text(text, current_title):
    if not text or len(text) < 100: return None
    try:
        client = OpenAI()
        prompt = f"Identify the podcast episode title and show name from the following transcript snippet.\nCurrent (generic) title: {current_title}\nText:\n{text[:2000]}\n\nReturn JSON: {{'title': '...', 'show_name': '...'}}"
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        res = json.loads(response.choices[0].message.content)
        return res.get("title")
    except Exception as e:
        print(f"AI Recovery failed: {e}")
        return None

def repair_via_cloud_storage(refetch_all=False):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    # 1. Get all sources with generic titles
    url = f"{SUPABASE_URL}/rest/v1/Source?title=eq.Podcast%20Episode"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Fetch failed: {resp.text}")
        return
        
    sources = resp.json()
    print(f"Attempting cloud repair/refetch for {len(sources)} sources...")

    import subprocess
    import sys

    for src in sources:
        source_id = src.get("source_id") or src.get("id")
        source_url = src.get("url")
        source_type = src.get("type") or "spotify" # Force spotify if missing
        
        print(f"Processing: {source_id} ({source_url})")
        
        if refetch_all and source_url:
            print(f"  -> FORCED REFETCH: Triggering Harvester for {source_id}...")
            harvest_cmd = [
                "python3", "transcript_harvester.py",
                "--source-id", source_id,
                "--url", source_url,
                "--source-type", source_type
            ]
            try:
                subprocess.run(harvest_cmd, capture_output=True, text=True, timeout=300)
                print(f"  -> Harvester complete. Pipeline resuscitated.")
            except Exception as e:
                print(f"  -> Harvester failed for {source_id}: {e}")

        # Standard cloud storage recovery fallback
        storage_url = f"{SUPABASE_URL}/storage/v1/object/authenticated/transcripts/{source_id}/{source_id}_raw.txt"
        s_resp = requests.get(storage_url, headers=headers)
        # ... rest of recovery logic ...

if __name__ == "__main__":
    import sys
    refetch = "--refetch-all" in sys.argv
    repair_via_cloud_storage(refetch_all=refetch)
