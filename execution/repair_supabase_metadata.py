import os
import json
import requests
from openai import OpenAI
from dotenv import load_dotenv

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def _require_supabase_env():
    """Verify Supabase credentials exist before performing operations."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        msg = ("Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL or "
               "SUPABASE_SERVICE_ROLE_KEY) in .env")
        raise RuntimeError(msg)

# Removed top-level exit(1) to prevent module import failures in non-DB contexts

def recover_title_from_text(text, current_title):
    if not text or len(text) < 100: return None
    try:
        client = OpenAI()
        prompt = (
            "Identify the podcast episode title and show name from the "
            "following transcript snippet.\n"
            f"Current (generic) title: {current_title}\n"
            f"Text:\n{text[:2000]}\n\n"
            "Return JSON: {'title': '...', 'show_name': '...'}"
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        res = json.loads(response.choices[0].message.content)
        new_title = res.get("title")
        if new_title:
             normalized = new_title.strip().lower()
             if normalized in [t.lower() for t in GENERIC_TITLES_DENYLIST]:
                 return None
        return new_title
    except Exception as e:
        print(f"AI Recovery failed: {e}")
        return None

GENERIC_TITLES_DENYLIST = ["Podcast Episode", "unknown", "untitled", "Episode"]

def update_source_metadata(source_id, updates):
    """Update source metadata in Supabase via REST API."""
    _require_supabase_env()
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    url = f"{SUPABASE_URL}/rest/v1/Source?id=eq.{source_id}"
    resp = requests.patch(url, headers=headers, json=updates, timeout=30)
    if resp.status_code not in (200, 201, 204):
        print(f"  -> DB Update failed for {source_id}: {resp.text}")
    else:
        print(f"  -> DB Update success for {source_id}.")

def repair_via_cloud_storage(refetch_all=False):
    _require_supabase_env()
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    # 1. Get all sources with generic titles
    url = f"{SUPABASE_URL}/rest/v1/Source"
    # Filter for generic titles in the list
    params = {
        "or": "(title.eq.Podcast Episode,title.eq.unknown,title.eq.Episode)"
    }
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"Fetch failed: {resp.text}")
        return
        
    sources = resp.json()
    print(f"Attempting cloud repair/refetch for {len(sources)} sources...")

    import subprocess
    import sys
    from pathlib import Path

    harvester_path = Path(__file__).parent / "transcript_harvester.py"

    for src in sources:
        source_id = src.get("id") or src.get("source_id")
        source_url = src.get("url")
        source_type = src.get("type") or "spotify"
        current_title = src.get("title")
        
        print(f"[{source_id}] Current: '{current_title}'")
        
        if refetch_all and source_url:
            print(f"  -> FORCED REFETCH: Triggering Harvester...")
            harvest_cmd = [
                sys.executable, str(harvester_path), 
                "--source-id", source_id, 
                "--url", source_url, 
                "--source-type", source_type
            ]
            try:
                h_res = subprocess.run(harvest_cmd, capture_output=True, text=True, timeout=300)
                if h_res.returncode != 0:
                    print(f"  -> Harvester crashed (Exit {h_res.returncode})")
                
                # Check JSON output for logic failures
                try:
                    h_out = json.loads(h_res.stdout)
                    if h_out.get("is_failure"):
                        print(f"  -> Harvester operational failure: {h_out.get('error_detail')}")
                except Exception:
                    pass
                print(f"  -> Harvester complete.")
            except Exception as e:
                print(f"  -> Harvester failed: {e}")

        # Standard cloud storage recovery fallback
        storage_url = f"{SUPABASE_URL}/storage/v1/object/authenticated/transcripts/{source_id}/{source_id}_raw.json"
        s_resp = requests.get(storage_url, headers=headers, timeout=30)
        
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
