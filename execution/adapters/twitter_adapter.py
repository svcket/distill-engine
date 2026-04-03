"""
Twitter adapter — unrolls X/Twitter threads into a single transcript.
Generates source_id from Tweet ID.
"""

import re
import hashlib
from .base_adapter import BaseAdapter, NormalizedSource


class TwitterAdapter(BaseAdapter):

    def detect(self, url: str) -> bool:
        """Detects twitter.com or x.com status URLs."""
        # Simple regex for twitter/x status URLs - handle both www and apex
        return bool(re.search(r"(?:twitter\.com|x\.com)/[^/]+/status/\d+", url))

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        # Extract ID from URL
        match = re.search(r"status/(\d+)", url)
        tweet_id = match.group(1) if match else "unknown"
        source_id = f"tw_{tweet_id}"

        # SAFETY: Avoid publishing synthetic thread text as high-confidence transcript data.
        # In non-shell/production paths, this should be marked as unavailable unless a real scraper is connected.
        unrolled_text = None
        is_synthetic = False
        confidence = 0.3 # Default for unverified/missing content
        status = "unavailable"

        if shell:
            mock_thread = [
                "This is the start of an unrolled Twitter thread.",
                "In a real production environment, this would contain the actual tweet content.",
                "The Distill Engine handles this via the transcript_harvester's rescued_text pathway.",
                "Final insight: unrolling threads into transcripts allows for deep DQM evaluation."
            ]
            unrolled_text = "\n\n".join(mock_thread)
            is_synthetic = True
            confidence = 0.9 # High confidence for purposeful dev-mode mocks
            status = "available"

        return NormalizedSource(
            source_id=source_id,
            source_type="twitter",
            title=f"Twitter Thread: {tweet_id}",
            creator="X / Twitter User",
            url=url,
            duration_seconds=0,
            description=f"Thread from {url}",
            transcript_status=status,
            language="en",
            source_confidence=confidence,
            raw_metadata={
                "tweet_id": tweet_id,
                "url": url,
                "rescued_article_text": unrolled_text,
                "is_unrolled": True,
                "is_synthetic": is_synthetic
            }
        )
