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

GENERIC_TITLES_DENYLIST = ["Podcast Episode", "unknown", "untitled", "Episode"]

def update_source_metadata(source_id, updates):
    """Update source metadata in Supabase via REST API."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    url = f"{SUPABASE_URL}/rest/v1/Source?id=eq.{source_id}"
    resp = requests.patch(url, headers=headers, json=updates)
    if resp.status_code not in (200, 201, 204):
        print(f"  -> DB Update failed for {source_id}: {resp.text}")
    else:
        print(f"  -> DB Update success for {source_id}.")

def repair_via_cloud_storage(refetch_all=False):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    # 1. Get all sources with generic titles
    url = f"{SUPABASE_URL}/rest/v1/Source"
    # Filter for generic titles in the list
    params = {
        "or": "(title.eq.Podcast%20Episode,title.eq.unknown,title.eq.Episode)"
    }
    resp = requests.get(url, headers=headers, params=params)
    if resp.status_code != 200:
        print(f"Fetch failed: {resp.text}")
        return
        
    sources = resp.json()
    print(f"Attempting cloud repair/refetch for {len(sources)} sources...")

    import subprocess

    for src in sources:
        # Use ID or source_id (Prisma models can vary)
        source_id = src.get("id") or src.get("source_id")
        source_url = src.get("url")
        source_type = src.get("type") or "spotify"
        current_title = src.get("title")
        
        print(f"[{source_id}] Current: '{current_title}'")
        
        if refetch_all and source_url:
            print(f"  -> FORCED REFETCH: Triggering Harvester...")
            harvest_cmd = ["python3", "transcript_harvester.py", "--source-id", source_id, "--url", source_url, "--source-type", source_type]
            try:
                subprocess.run(harvest_cmd, capture_output=True, text=True, timeout=300)
                print(f"  -> Harvester complete.")
            except Exception as e:
                print(f"  -> Harvester failed: {e}")

        # Standard cloud storage recovery fallback
        storage_url = f"{SUPABASE_URL}/storage/v1/object/authenticated/transcripts/{source_id}/{source_id}_raw.json"
        s_resp = requests.get(storage_url, headers=headers)
        
        if s_resp.status_code == 200:
            try:
                raw_data = s_resp.json()
                # If it's the JSON segment list, grab first 10 segments for title recovery
                text_content = ""
                if isinstance(raw_data, list):
                    text_content = " ".join([seg.get("text", "") for seg in raw_data[:15]])
                
                if text_content:
                    print(f"  -> Recovering title from storage transcript...")
                    new_title = recover_title_from_text(text_content, current_title)
                    if new_title and new_title not in GENERIC_TITLES_DENYLIST:
                        print(f"  -> New Title Found: {new_title}")
                        update_source_metadata(source_id, {"title": new_title})
                    else:
                        print(f"  -> No better title found via AI.")
            except Exception as e:
                print(f"  -> Failed to parse stored transcript: {e}")
        else:
            print(f"  -> No transcript found in storage (Code {s_resp.status_code}).")

if __name__ == "__main__":
    import sys
    refetch = "--refetch-all" in sys.argv
    repair_via_cloud_storage(refetch_all=refetch)
