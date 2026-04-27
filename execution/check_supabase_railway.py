import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

result = {
    "has_url": bool(url),
    "has_key": bool(key),
    "url_prefix": url[:30] if url else None,
    "key_prefix": key[:15] if key else None,
}

# Try actual upload
try:
    from supabase import create_client
    client = create_client(url, key)
    import json as _json
    test_data = _json.dumps({"test": True, "source": "railway_connectivity_check"})
    res = client.storage.from_("transcripts").upload(
        path="__connectivity_test/__test.json",
        file=test_data.encode(),
        file_options={"upsert": "true", "content-type": "application/json"}
    )
    result["upload_ok"] = True
except Exception as e:
    result["upload_ok"] = False
    result["upload_error"] = str(e)[:200]

print(json.dumps(result))
