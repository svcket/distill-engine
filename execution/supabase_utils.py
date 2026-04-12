import os
import sys
from typing import Optional
from dotenv import load_dotenv

# Lazy import — supabase is optional. Pipeline must not crash if package is missing.
try:
    from supabase import create_client, Client as SupabaseClient
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    SupabaseClient = None  # type: ignore

load_dotenv()

# SUPABASE CONFIG
url: Optional[str] = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key: Optional[str] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase_client():
    if not _SUPABASE_AVAILABLE:
        print("[Supabase] Warning: supabase package not installed. Skipping cloud upload.", file=sys.stderr)
        return None
    if not url or not key:
        print("[Supabase] Warning: Missing URL or SERVICE_KEY. Skipping cloud upload.", file=sys.stderr)
        return None
    return create_client(url, key)
    
def ensure_bucket_exists(bucket_id: str):
    """
    Ensure a Supabase Storage bucket exists. Creates it if missing.
    """
    client = get_supabase_client()
    if not client:
        return False
        
    try:
        # Check if bucket exists
        client.storage.get_bucket(bucket_id)
        return True
    except Exception as e:
        # If 404/not found, attempt creation
        if "not found" in str(e).lower() or "404" in str(e):
            try:
                print(f"[Supabase] Provisioning missing bucket: '{bucket_id}'...", file=sys.stderr)
                client.storage.create_bucket(bucket_id, options={"public": False})
                return True
            except Exception as create_err:
                print(f"[Supabase] Failed to provision bucket '{bucket_id}': {create_err}", file=sys.stderr)
                return False
        return False

def upload_artifact(category: str, source_id: str, local_path: str, filename: Optional[str] = None):
    """
    Upload a local .tmp file to the corresponding Supabase Storage bucket.
    """
    client = get_supabase_client()
    if not client:
        return None

    # Self-Healing: Ensure bucket exists before upload
    ensure_bucket_exists(category)

    if not filename:
        filename = os.path.basename(local_path)

    # Remote path: [source_id]/[filename]
    remote_path = f"{source_id}/{filename}"
    
    try:
        with open(local_path, 'rb') as f:
            # Silence the upload log for a cleaner user-facing Processing Log
            # print(f"[Supabase] Uploading {category}: {remote_path}...", file=sys.stderr)
            client.storage.from_(category).upload(
                path=remote_path,
                file=f,
                file_options={"upsert": "true", "content-type": "application/json"}
            )
        return True
    except Exception as e:
        print(f"[Supabase] Error: Upload failed for {remote_path}: {e}", file=sys.stderr)
        return False
def ensure_local_path(local_path: str):
    """
    Ensure the directory for a local .tmp path exists.
    """
    directory = os.path.dirname(local_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)

def download_artifact(category: str, source_id: str, filename: str, local_path: str):
    """
    Download an artifact from Supabase Storage to a local path.
    Returns True if successful, False otherwise.
    """
    client = get_supabase_client()
    if not client:
        return False

    # Self-Healing: Ensure bucket exists before download
    ensure_bucket_exists(category)

    # Remote path: [source_id]/[filename]
    remote_path = f"{source_id}/{filename}"
    
    try:
        ensure_local_path(local_path)
        
        # Download the file
        res = client.storage.from_(category).download(remote_path)
        if res:
            with open(local_path, 'wb') as f:
                f.write(res)
            return True
        return False
    except Exception as e:
        # Check if it's just a 404 (file doesn't exist in storage)
        if "The object was not found" in str(e) or "404" in str(e):
            return False
            
        print(f"[Supabase] Error: Download failed for {remote_path}: {e}", file=sys.stderr)
        return False
