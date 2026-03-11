import sys
import argparse
import json
import os
from datetime import datetime
from googleapiclient.discovery import build
from adapters.adapter_router import route_source

def scout_sources(query: str, max_results: int = 5):
    """
    Search for candidate sources matching the query.
    If the query is a URL, it delegates to the adapters.
    Otherwise, it searches YouTube.
    """
    # 1. Check if the query is a URL that an adapter can handle
    if query.startswith("http://") or query.startswith("https://"):
        try:
            source = route_source(query)
            # Return single array item mimicking the UI discovery object
            result = [{
                "source_id": source.source_id,
                "url": source.url,
                "title": source.title,
                "creator": source.creator,
                "published_at": source.published_at,
                "duration": source._seconds_to_iso(source.duration_seconds),
                "description": source.description,
                "topic_matches": ["Direct URL"],
                "whitelist_match": True,
                "discovery_context": "direct_url",
                "source_type": source.source_type
            }]
            
            base_dir = os.path.dirname(os.path.abspath(__file__))
            output_dir = os.path.join(base_dir, ".tmp", "sources")
            os.makedirs(output_dir, exist_ok=True)
            out_path = os.path.join(output_dir, f"discovery_{datetime.now().strftime('%Y%m%d%H%M%S')}.json")
            with open(out_path, "w") as f:
                json.dump(result, f, indent=2)
            
            print(json.dumps(result))
            return
        except ValueError as e:
            # If it looks like a URL but we don't have an adapter, do NOT search YouTube
            # unless it's a very generic string that happens to start with http
            print(json.dumps({"error": f"Unsupported or unrecognized URL: {str(e)}"}), file=sys.stderr)
            sys.exit(1)
            
    # If not a URL, continue to YouTube Search...
    
    # Fallback to Mock Data if no API key is present
    if not api_key:
        fallback_data = [
            {
                "source_id": f"mock_{i}",
                "url": f"https://youtube.com/watch?v=mock_{i}",
                "title": f"Mock Discovery Result {i} for '{query}'",
                "creator": "API Key Missing Fallback Channel",
                "published_at": datetime.utcnow().isoformat() + "Z",
                "duration": "PT12M34S",
                "description": "Please add YOUTUBE_API_KEY to your .env to get real results.",
                "topic_matches": [query],
                "whitelist_match": False,
                "discovery_context": "fallback_mock"
            } for i in range(max_results)
        ]
        
        output_dir = os.path.join(os.getcwd(), ".tmp", "sources")
        os.makedirs(output_dir, exist_ok=True)
        
        # Save to disk
        out_path = os.path.join(output_dir, f"discovery_{datetime.now().strftime('%Y%m%d%H%M%S')}.json")
        with open(out_path, "w") as f:
            json.dump(fallback_data, f, indent=2)
            
        # Print for Node stdout parsing
        print(json.dumps(fallback_data))
        return

    try:
        youtube = build('youtube', 'v3', developerKey=api_key)

        # 1. Search for videos
        search_response = youtube.search().list(
            q=query,
            part='id,snippet',
            maxResults=max_results,
            type='video'
        ).execute()

        video_ids = [item['id']['videoId'] for item in search_response['items']]

        if not video_ids:
            print(json.dumps([]))
            return

        # 2. Get detailed video metrics (duration, views)
        video_response = youtube.videos().list(
            id=','.join(video_ids),
            part='contentDetails,snippet,statistics'
        ).execute()

        results = []
        for item in video_response['items']:
            # Duration comes back as ISO 8601 duration (e.g. PT15M33S)
            duration_raw = item['contentDetails']['duration']
            
            results.append({
                "source_id": item['id'],
                "url": f"https://www.youtube.com/watch?v={item['id']}",
                "title": item['snippet']['title'],
                "creator": item['snippet']['channelTitle'],
                "published_at": item['snippet']['publishedAt'],
                "duration": duration_raw, # We'll let frontend/adapters parse this cleanly
                "description": item['snippet']['description'][:200] + "...",
                "topic_matches": [query],
                "whitelist_match": False,
                "discovery_context": "organic_search"
            })

        # Standardize on execution/.tmp/ for all scripts
        base_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(base_dir, ".tmp", "sources")
        os.makedirs(output_dir, exist_ok=True)
        
        # Save to disk
        out_path = os.path.join(output_dir, f"discovery_{datetime.now().strftime('%Y%m%d%H%M%S')}.json")
        with open(out_path, "w") as f:
            json.dump(results, f, indent=2)

        # Print for Node stdout parsing
        print(json.dumps(results))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scout for source candidates.")
    parser.add_argument("--query", required=True, help="URL, search term, topic, or channel name.")
    parser.add_argument("--max", type=int, default=5, help="Max number of results to return for searches.")
    
    args = parser.parse_args()
    
    # Ensure our current directory is in sys.path so we can import adapters
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    scout_sources(args.query, args.max)
