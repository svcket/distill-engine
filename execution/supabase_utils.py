import os
import sys
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# SUPABASE CONFIG
url: Optional[str] = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key: Optional[str] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase_client() -> Optional[Client]:
    if not url or not key:
        print("[Supabase] Warning: Missing URL or SERVICE_KEY. Skipping cloud upload.", file=sys.stderr)
        return None
    return create_client(url, key)

def upload_artifact(category: str, source_id: str, local_path: str, filename: Optional[str] = None):
    """
    Upload a local .tmp file to the corresponding Supabase Storage bucket.
    """
    client = get_supabase_client()
    if not client:
        return None

    if not filename:
        filename = os.path.basename(local_path)

    # Remote path: [source_id]/[filename]
    remote_path = f"{source_id}/{filename}"
    
    try:
        with open(local_path, 'rb') as f:
            print(f"[Supabase] Uploading {category}: {remote_path}...", file=sys.stderr)
            client.storage.from_(category).upload(
                path=remote_path,
                file=f,
                file_options={"upsert": "true", "content-type": "application/json"}
            )
        return True
    except Exception as e:
        print(f"[Supabase] Error: Upload failed for {remote_path}: {e}", file=sys.stderr)
        return False
