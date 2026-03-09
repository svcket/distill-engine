import sys
import argparse
import json
import os
from datetime import datetime
from googleapiclient.discovery import build

def discover_youtube_sources(query: str, max_results: int = 5):
    """
    Search YouTube for candidate videos matching the query.
    Extracts metadata: Title, Channel, Video ID, Publish Date, Duration, View Count.
    """
    api_key = os.environ.get("YOUTUBE_API_KEY")
    
    # Fallback to Mock Data if no API key is present
    if not api_key:
        fallback_data = [
            {
                "video_id": f"mock_{i}",
                "url": f"https://youtube.com/watch?v=mock_{i}",
                "title": f"Mock Discovery Result {i} for '{query}'",
                "channel": "API Key Missing Fallback Channel",
                "published_at": datetime.utcnow().isoformat() + "Z",
                "duration": "12:34",
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
                "video_id": item['id'],
                "url": f"https://www.youtube.com/watch?v={item['id']}",
                "title": item['snippet']['title'],
                "channel": item['snippet']['channelTitle'],
                "published_at": item['snippet']['publishedAt'],
                "duration": duration_raw, # We'll let frontend/adapters parse this cleanly
                "description": item['snippet']['description'][:200] + "...",
                "topic_matches": [query],
                "whitelist_match": False,
                "discovery_context": "organic_search"
            })

        output_dir = os.path.join(os.getcwd(), ".tmp", "sources")
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
    parser = argparse.ArgumentParser(description="Scout YouTube for video candidates.")
    parser.add_argument("--query", required=True, help="Search term, topic, or channel name.")
    parser.add_argument("--max", type=int, default=5, help="Max number of results to return.")
    
    args = parser.parse_args()
    discover_youtube_sources(args.query, args.max)
