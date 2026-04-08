import os
import json
import re
import urllib.request
from openai import OpenAI
from dotenv import load_dotenv

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

def is_generic_title(title):
    if not title: return True
    generic = ["podcast episode", "episode", "podcast", "unknown", "untitled", "spotify"]
    return title.lower().strip() in generic

def get_itunes_title(url):
    try:
        m = re.search(r"/id(\d+)", url)
        if not m: return None
        lookup_id = m.group(1)
        entity = "podcastEpisode" if "i=" in url or "/episode/" in url.lower() else "podcast"
        lookup_url = f"https://itunes.apple.com/lookup?id={lookup_id}&entity={entity}"
        req = urllib.request.Request(lookup_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.load(resp)
            results = data.get("results", [])
            if results:
                return results[0].get("trackName") or results[0].get("collectionName")
    except: pass
    return None

def recover_title_via_llm(content):
    client = OpenAI()
    prefix = content[:3000]
    prompt = f"Identify the podcast episode title and show name from this transcript snippet. Return ONLY a JSON object with 'title' and 'show_name'.\n\nSnippet:\n{prefix}"
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        res = json.loads(response.choices[0].message.content)
        return res.get("title"), res.get("show_name")
    except: return None, None

def run_repair():
    base = os.path.dirname(os.path.abspath(__file__))
    sources_dir = os.path.join(base, ".tmp", "sources")
    if not os.path.exists(sources_dir):
        print("Sources directory not found.")
        return

    for filename in os.listdir(sources_dir):
        if not filename.endswith(".json"): continue
        path = os.path.join(sources_dir, filename)
        try:
            with open(path, "r") as f:
                data = json.load(f)
            
            source = data[0] if isinstance(data, list) else data
            current_title = source.get("title")
            source_id = source.get("source_id") or source.get("id") or filename.split(".")[0]
            source_url = source.get("url")

            if is_generic_title(current_title):
                print(f"Repairing: {source_id} (Current: {current_title})")
                
                # 1. Try iTunes
                new_title = get_itunes_title(source_url) if source_url else None
                
                # 2. Try LLM
                if not new_title:
                    txt_path = os.path.join(base, ".tmp", "transcripts", source_id, f"{source_id}_raw.txt")
                    if os.path.exists(txt_path):
                        with open(txt_path, "r") as f:
                            content = f.read()
                        new_title, show = recover_title_via_llm(content)
                        if show: source["creator"] = show

                if new_title and not is_generic_title(new_title):
                    print(f"  -> Found: {new_title}")
                    source["title"] = new_title
                    with open(path, "w") as f:
                        json.dump(data, f, indent=2)
                else: print("  -> No title found.")
        except Exception as e:
            print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    run_repair()
