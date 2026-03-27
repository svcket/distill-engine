import os
import json
import logging
import argparse
from typing import List, Dict, Any, Optional

# Attempt to import tweepy, but don't fail if it's missing (for dev environments)
try:
    import tweepy
    HAS_TWEEPY = True
except ImportError:
    HAS_TWEEPY = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TwitterPublisher:
    def __init__(self):
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET")
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
        self.bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
        
        self.is_configured = all([self.api_key, self.api_secret, self.access_token, self.access_token_secret])
        self.client = None

        if self.is_configured and HAS_TWEEPY:
            try:
                self.client = tweepy.Client(
                    bearer_token=self.bearer_token,
                    consumer_key=self.api_key,
                    consumer_secret=self.api_secret,
                    access_token=self.access_token,
                    access_token_secret=self.access_token_secret,
                    wait_on_rate_limit=True
                )
                logger.info("Twitter Client initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Twitter Client: {e}")
                self.is_configured = False

    def publish_thread(self, hook: str, thread: List[str], cta: str, dry_run: bool = False) -> Dict[str, Any]:
        full_content = [hook] + thread + [cta]
        
        if dry_run or not self.is_configured:
            logger.info(f"DRY RUN: Publishing thread with {len(full_content)} tweets.")
            for i, tweet in enumerate(full_content):
                logger.info(f"Tweet {i+1}/{len(full_content)}: {tweet[:50]}...")
            
            return {
                "success": True,
                "mode": "dry_run" if dry_run else "unconfigured_fallback",
                "tweet_ids": [f"mock_{i}" for i in range(len(full_content))],
                "message": "Thread would have been published successfully."
            }

        try:
            last_tweet_id = None
            published_ids = []
            
            for tweet_text in full_content:
                response = self.client.create_tweet(
                    text=tweet_text,
                    in_reply_to_tweet_id=last_tweet_id
                )
                last_tweet_id = response.data['id']
                published_ids.append(last_tweet_id)
                logger.info(f"Published tweet ID: {last_tweet_id}")

            return {
                "success": True,
                "mode": "live",
                "tweet_ids": published_ids,
                "message": f"Successfully published thread with {len(published_ids)} tweets."
            }

        except Exception as e:
            logger.error(f"Error publishing thread: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to publish thread."
            }

def main():
    parser = argparse.ArgumentParser(description="Publish X/Twitter Thread")
    parser.add_argument("--content", required=True, help="Path to thread JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Perform a dry run without posting")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.content):
        print(json.dumps({"success": False, "error": "Content file not found."}))
        return

    with open(args.content, "r") as f:
        data = json.load(f)

    # Validate structure
    hook = data.get("hook", "")
    thread = data.get("thread", [])
    cta = data.get("cta", "")

    publisher = TwitterPublisher()
    result = publisher.publish_thread(hook, thread, cta, dry_run=args.dry_run)
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
